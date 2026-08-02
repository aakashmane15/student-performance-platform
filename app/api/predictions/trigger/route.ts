import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, withErrorHandling, ApiError } from "@/lib/api-helpers";
import { PredictionTriggerSchema } from "@/lib/schemas";

export const POST = withErrorHandling(async (req) => {
  const session = await requireRole(["ADMIN", "TEACHER"]);

  const { studentId, courseId } = PredictionTriggerSchema.parse(
    await req.json(),
  );

  // 1. Pull all the student's data for this course
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      grades: { where: { courseId }, orderBy: { gradedAt: "asc" } },
      attendance: { where: { courseId }, orderBy: { date: "asc" } },
    },
  });
  if (!student) throw new ApiError("Student not found", 404);

  // 2. Compute the 5 features the model was trained on
  const assignments = student.grades.filter((g) => g.examType === "ASSIGNMENT");
  const quizzes = student.grades.filter((g) => g.examType === "QUIZ");
  const midterm = student.grades.find((g) => g.examType === "MIDTERM");
  const present = student.attendance.filter(
    (a) => a.status === "PRESENT",
  ).length;
  const total = student.attendance.length || 1;

  //  studytime proxy: assignment completion rate on a 1-4 scale
  const completionRate = assignments.length / Math.max(total / 5, 1);
  const studytime = Math.min(4, Math.max(1, Math.round(completionRate * 4)));

  //  failures proxy: how many assessments scored below 50%
  const failures = Math.min(
    4,
    student.grades.filter((g) => g.score / g.maxScore < 0.5).length,
  );

  //  absences: direct from attendance
  const absences = total - present;

  //  G1 proxy: average quiz score (on a 0–20 scale)
  const G1 = quizzes.length
    ? Math.round(
        quizzes.reduce((s, g) => s + (g.score / g.maxScore) * 20, 0) /
          quizzes.length,
      )
    : 10;

  //  G2 proxy: midterm score (on a 0–20 scale) or assignment average
  const G2 = midterm
    ? Math.round((midterm.score / midterm.maxScore) * 20)
    : assignments.length
      ? Math.round(
          assignments.reduce((s, g) => s + (g.score / g.maxScore) * 20, 0) /
            assignments.length,
        )
      : 10;

  const mlPayload = {
    student_id: studentId,
    course_id: courseId,
    studytime,
    failures,
    absences,
    G1,
    G2,
  };

  // 3. Call FastAPI ML service
  const mlUrl = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
  let prediction: any;

  try {
    const res = await fetch(`${mlUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mlPayload),
      // Abort if ML service takes > 10 seconds
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`ML service returned ${res.status}`);
    prediction = await res.json();
  } catch (err) {
    throw new ApiError(
      "ML service is unavailable. Please try again in a moment.",
      503,
    );
  }

  // 4. Save prediction to database
  const saved = await prisma.prediction.create({
    data: {
      studentId,
      courseId,
      predictedGrade: prediction.predicted_grade,
      passProb: prediction.pass_probability,
      dropoutRisk: prediction.dropout_risk,
      riskCategory: prediction.risk_category,
      shapValues: prediction.shap_values,
    },
  });

  // 5. Create notification for HIGH/CRITICAL risk students
  if (["HIGH", "CRITICAL"].includes(prediction.risk_category)) {
    await prisma.notification.create({
      data: {
        userId: student.userId,
        message: prediction.insight,
        type: "RISK_ALERT",
      },
    });
  }

  return NextResponse.json({
    ...prediction,
    predictionId: saved.id,
  });
});
