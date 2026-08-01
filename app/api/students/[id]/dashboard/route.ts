import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, withErrorHandling, ApiError } from "@/lib/api-helpers";

export const GET = withErrorHandling(
  async (req, { params }: { params: { id: string } }) => {
    const session = await requireRole(["ADMIN", "STUDENT"]);

    // Students can only see their own data
    if (session.user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: session.user.id },
      });
      if (student?.id !== params.id) throw new ApiError("Forbidden", 403);
    }

    const student = await prisma.student.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { name: true, email: true } },
        enrollments: {
          include: {
            course: {
              include: {
                teacher: { include: { user: { select: { name: true } } } },
              },
            },
          },
        },
        grades: { orderBy: { gradedAt: "asc" } },
        attendance: { orderBy: { date: "asc" } },
        predictions: { orderBy: { generatedAt: "desc" }, take: 5 },
      },
    });

    if (!student) throw new ApiError("Student not found", 404);

    const presentCount = student.attendance.filter(
      (a) => a.status === "PRESENT",
    ).length;
    const attendancePct = student.attendance.length
      ? Math.round((presentCount / student.attendance.length) * 100)
      : 0;

    const avgScore = student.grades.length
      ? student.grades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) /
        student.grades.length
      : 0;

    return NextResponse.json({
      student,
      computed: { attendancePct, avgScore: Math.round(avgScore) },
    });
  },
);
