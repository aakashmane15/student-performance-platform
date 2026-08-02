import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, withErrorHandling } from "@/lib/api-helpers";

export const GET = withErrorHandling(async (req) => {
  const session = await requireRole(["ADMIN", "TEACHER"]);

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category"); // HIGH, CRITICAL, or null for both
  const courseId = searchParams.get("courseId");

  // Get courses this teacher owns (admin gets all)
  let allowedCourseIds: string[] | undefined;
  if (session.user.role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
    });
    const courses = await prisma.course.findMany({
      where: { teacherId: teacher!.id },
      select: { id: true },
    });
    allowedCourseIds = courses.map((c) => c.id);
  }

  // Get the latest prediction per student per course
  const predictions = await prisma.prediction.findMany({
    where: {
      riskCategory: { in: category ? [category as any] : ["HIGH", "CRITICAL"] },
      ...(courseId ? { courseId } : {}),
      ...(allowedCourseIds ? { courseId: { in: allowedCourseIds } } : {}),
    },
    include: {
      student: { include: { user: { select: { name: true, email: true } } } },
      course: { select: { name: true, code: true } },
    },
    orderBy: { generatedAt: "desc" },
    take: 100,
  });

  // Deduplicate: only keep latest prediction per student+course pair
  const seen = new Set<string>();
  const unique = predictions.filter((p) => {
    const key = `${p.studentId}-${p.courseId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ predictions: unique, total: unique.length });
});
