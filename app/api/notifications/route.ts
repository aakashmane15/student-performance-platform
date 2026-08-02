import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withErrorHandling } from "@/lib/api-helpers";

export const GET = withErrorHandling(async () => {
  const session = await requireAuth();

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
});
