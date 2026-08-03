import { auth } from "./lib/auth";
import { NextResponse } from "next/server";

const ROLE_MAP: Record<string, string[]> = {
  "/dashboard/admin": ["ADMIN"],
  "/dashboard/teacher": ["ADMIN", "TEACHER"],
  "/dashboard/student": ["ADMIN", "STUDENT"],
};

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;

  // Checks if anyone is logged in, if not sends to the login page
  if (!session) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Wrong user/unauthorized user
  for (const [route, roles] of Object.entries(ROLE_MAP)) {
    if (
      nextUrl.pathname.startsWith(route) &&
      !roles.includes(session.user.role!)
    ) {
      return NextResponse.redirect(new URL("/unauthorized", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/students/:path*",
    "/api/courses/:path*",
    "/api/grades/:path*",
    "/api/attendance/:path*",
    "/api/predictions/:path*",
    "/api/notifications/:path*",
  ],
};
