import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/app/lib/auth";

/**
 * Optimistic gate only — it checks that a session cookie exists, not that it is
 * valid, so an unauthenticated visitor is bounced without a database round
 * trip. The authoritative check runs in the dashboard layout and in every API
 * route, where the token is actually verified against the database.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: "/dashboard/:path*",
};
