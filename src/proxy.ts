import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Fast sign-in redirect only. Pages and API handlers verify the DB session and
 * bind their queries to its owner; cookie presence does not authorize access.
 */
export function proxy(request: Request): NextResponse {
  const url = new URL(request.url);
  if ((url.pathname === "/app" || url.pathname.startsWith("/app/")) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
