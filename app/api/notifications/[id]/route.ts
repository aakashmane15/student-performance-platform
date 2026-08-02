import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withErrorHandling, ApiError } from "@/lib/api-helpers";

export const PATCH = withErrorHandling(async (req, { params }) => {
  const session = await requireAuth();

  const notification = await prisma.notification.findUnique({
    where: { id: params.id },
  });
  if (!notification || notification.userId !== session.user.id) {
    throw new ApiError("Not found", 404);
  }

  await prisma.notification.update({
    where: { id: params.id },
    data: { isRead: true },
  });

  return NextResponse.json({ success: true });
});
