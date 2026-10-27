import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/app/lib/auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Two cheap checks before a request reaches the app:
 *
 * - API writes (POST, PATCH, DELETE…) sent by a web page must come from a
 *   page on this site. Browsers always say which site a page is on (the
 *   Origin header) and a page cannot fake it, so another website can never
 *   make a visitor's browser sign in, order or change anything here.
 *   Requests without the header (scripts, tests) are left to the routes'
 *   own checks.
 * - Dashboard pages: an optimistic gate that only checks a session cookie
 *   exists, not that it is valid, so a visitor without one is bounced
 *   without a database round trip. The authoritative check runs in the
 *   dashboard layout and in every API route, where the token is verified
 *   against the database.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    if (!SAFE_METHODS.has(request.method) && origin !== null && !sameSite(origin, request)) {
      return NextResponse.json({ success: false, message: "Cross-site request refused" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

function sameSite(origin: string, request: NextRequest): boolean {
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
