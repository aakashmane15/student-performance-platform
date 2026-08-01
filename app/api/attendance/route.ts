import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, withErrorHandling } from "@/lib/api-helpers";
import { AttendanceSchema } from "@/lib/schemas";
import { z } from "zod";

export const POST = withErrorHandling(async (req) => {
  await requireRole(["ADMIN", "TEACHER"]);

  const body = await req.json();
  const records = z.array(AttendanceSchema).parse(body.records);

  const results = await Promise.all(
    records.map((r) =>
      prisma.attendance.upsert({
        where: {
          studentId_courseId_date: {
            studentId: r.studentId,
            courseId: r.courseId,
            date: new Date(r.date),
          },
        },
        create: { ...r, date: new Date(r.date) },
        update: { status: r.status },
      }),
    ),
  );

  return NextResponse.json({ saved: results.length }, { status: 201 });
});

export const GET = withErrorHandling(async (req) => {
  await requireRole(["ADMIN", "TEACHER"]);

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const date = searchParams.get("date");

  if (!courseId) {
    return NextResponse.json(
      { error: "courseId is required" },
      { status: 400 },
    );
  }

  const records = await prisma.attendance.findMany({
    where: {
      courseId,
      ...(date
        ? {
            date: {
              gte: new Date(date),
              lt: new Date(new Date(date).getTime() + 86400000),
            },
          }
        : {}),
    },
    include: { student: { include: { user: { select: { name: true } } } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ records });
});
