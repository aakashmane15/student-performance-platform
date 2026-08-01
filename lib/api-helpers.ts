import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError("Unauthorized", 401);
  }
  return session;
}

export async function requireRole(roles: string[]) {
  const session = await requireAuth();
  if (!roles.includes(session.user.role!)) {
    throw new ApiError("Forbidden — insufficient permissions", 403);
  }
  return session;
}

// Wraps any route handler and catches ApiError and returns proper HTTP response
export function withErrorHandling(
  handler: (req: Request, ctx?: any) => Promise<Response>,
) {
  return async (req: Request, ctx?: any) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      console.error("[API Error]", err);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
