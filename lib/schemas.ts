import { z } from "zod";

export const LoginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const GradeSchema = z
  .object({
    studentId: z.cuid(),
    courseId: z.cuid(),
    examType: z.enum(["QUIZ", "ASSIGNMENT", "MIDTERM", "FINAL"]),
    score: z.number().min(0),
    maxScore: z.number().min(1),
  })
  .refine((d) => d.score <= d.maxScore, {
    message: "Score cannot exceed max score",
    path: ["score"],
  });

export const AttendanceSchema = z.object({
  studentId: z.cuid(),
  courseId: z.cuid(),
  date: z.iso.datetime(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
});

export const PredictionTriggerSchema = z.object({
  studentId: z.cuid(),
  courseId: z.cuid(),
});

export const RegisterSchema = z.object({
  name: z.string().min(2, "Name must contain at least 2 characters"),
  email: z.email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
