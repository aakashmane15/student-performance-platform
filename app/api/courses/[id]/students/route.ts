import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, withErrorHandling, ApiError } from "@/lib/api-helpers";

export const GET = withErrorHandling(
  async (req, { params }: { params: { id: string } }) => {
    const session = await requireRole(["ADMIN", "TEACHER"]);

    // Teachers can only view their own courses
    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
      });
      const course = await prisma.course.findUnique({
        where: { id: params.id },
      });
      if (course?.teacherId !== teacher?.id)
        throw new ApiError("Forbidden", 403);
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId: params.id },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } },
            grades: { where: { courseId: params.id } },
            attendance: { where: { courseId: params.id } },
            predictions: {
              where: { courseId: params.id },
              orderBy: { generatedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    return NextResponse.json({ students: enrollments.map((e) => e.student) });
  },
);
