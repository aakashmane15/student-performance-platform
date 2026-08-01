import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { RegisterSchema } from "@/lib/schemas";
import { z } from "zod";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.parse(body);

    const exists = await prisma.user.findUnique({
      where: {
        email: parsed.email,
      },
    });

    if (exists) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 400 },
      );
    }

    const hashedPassword = await bcrypt.hash(parsed.password, 12);

    const user = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHashed: hashedPassword,
        role: "STUDENT",

        student: {
          create: {
            enrollmentNumber: `EN${Date.now()}`,
            department: "General",
            year: 1,
            section: "A",
          },
        },
      },
    });

    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 422 });
    }

    console.error(err);

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
