import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const adminUser = await prisma.user.create({
    data: {
      name: "Test Admin",
      email: "admin@test.com",
      passwordHashed: await bcrypt.hash("admin@123", 10),
      role: "ADMIN",
      admin: { create: {} },
    },
  });

  const teacherUser = await prisma.user.create({
    data: {
      name: "Test Teacher",
      email: "teacher@test.com",
      passwordHashed: await bcrypt.hash("teacher@123", 10),
      role: "TEACHER",
      teacher: {
        create: {
          department: "CSBS",
          subjectsTaught: ["DBMS", "OOP"],
        },
      },
    },
  });

  const studentUser = await prisma.user.create({
    data: {
      name: "Test Student",
      email: "student@test.com",
      passwordHashed: await bcrypt.hash("student@123", 10),
      role: "STUDENT",
      student: {
        create: {
          enrollmentNumber: "2324001289",
          department: "CSBS",
          year: 4,
          section: "B",
        },
      },
    },
  });

  const teacher = await prisma.teacher.findUnique({
    where: { userId: teacherUser.id },
  });
  const student = await prisma.student.findUnique({
    where: { userId: studentUser.id },
  });

  const course = await prisma.course.create({
    data: {
      name: "Database Management System",
      code: "UCBP01",
      teacherId: teacher!.id,
      semester: "Semester 4",
    },
  });

  await prisma.enrollment.create({
    data: { studentId: student!.id, courseId: course.id },
  });

  const dates = Array.from({ length: 20 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (20 - i) * 2);
    return d;
  });

  for (let i = 0; i < dates.length; i++) {
    await prisma.attendance.create({
      data: {
        studentId: student!.id,
        courseId: course.id,
        date: dates[i],
        status: i % 4 === 0 ? "ABSENT" : "PRESENT",
      },
    });
  }

  const gradeData = [
    { examType: "QUIZ" as const, score: 18, maxScore: 20 },
    { examType: "ASSIGNMENT" as const, score: 15, maxScore: 20 },
    { examType: "QUIZ" as const, score: 14, maxScore: 20 },
    { examType: "ASSIGNMENT" as const, score: 11, maxScore: 20 },
    { examType: "MIDTERM" as const, score: 38, maxScore: 60 },
  ];

  for (const g of gradeData) {
    await prisma.grade.create({
      data: { studentId: student!.id, courseId: course.id, ...g },
    });
  }

  await prisma.prediction.create({
    data: {
      studentId: student!.id,
      courseId: course.id,
      predictedGrade: 51.3,
      passProb: 0.61,
      dropoutRisk: 0.43,
      riskCategory: "HIGH",
      shapValues: {
        base_value: 0.28,
        features: {
          attendance_pct: {
            value: 0.72,
            impact: 0.18,
            direction: "increases_risk",
          },
          midterm_score: {
            value: 0.63,
            impact: 0.12,
            direction: "increases_risk",
          },
          assignment_rate: {
            value: 0.8,
            impact: -0.06,
            direction: "reduces_risk",
          },
          grade_trend: {
            value: -0.15,
            impact: 0.09,
            direction: "increases_risk",
          },
        },
      },
    },
  });

  console.log("Seed complete: 3 demo accounts created");
  console.log("admin@test.com / admin@123");
  console.log("teacher@test.com / teacher@123");
  console.log("student@test.com / student@123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
