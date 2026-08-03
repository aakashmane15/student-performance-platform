import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const ROLE_MAP: Record<string, string[]> = {
  "/dashboard/admin": ["ADMIN"],
  "/dashboard/teacher": ["ADMIN", "TEACHER"],
  "/dashboard/student": ["ADMIN", "STUDENT"],
};

export default auth((req) => {
  const session = req.auth;

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const role = (session.user as any)?.role;

  for (const [route, roles] of Object.entries(ROLE_MAP)) {
    if (req.nextUrl.pathname.startsWith(route) && !roles.includes(role)) {
      return NextResponse.redirect(new URL("/unauthorized", req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
