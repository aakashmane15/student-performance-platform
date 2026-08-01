import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, withErrorHandling } from "@/lib/api-helpers";
import { GradeSchema } from "@/lib/schemas";
import { z } from "zod";

export const POST = withErrorHandling(async (req) => {
  await requireRole(["ADMIN", "TEACHER"]);

  const body = await req.json();
  const grades = z.array(GradeSchema).parse(body.grades); // validates array

  const created = await prisma.$transaction(
    grades.map((g) => prisma.grade.create({ data: g })),
  );

  return NextResponse.json({ created: created.length }, { status: 201 });
});

export const GET = withErrorHandling(async (req) => {
  await requireRole(["ADMIN", "TEACHER"]);

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  const grades = await prisma.grade.findMany({
    where: { ...(courseId ? { courseId } : {}) },
    include: { student: { include: { user: { select: { name: true } } } } },
    orderBy: { gradedAt: "desc" },
  });

  return NextResponse.json({ grades });
});
