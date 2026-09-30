import { NextResponse } from "next/server";
import { readSessionCookie, splitSessionCookie } from "@/server/auth";
import { resolveSession } from "@/server/auth-store";
import { ensureDatabase } from "@/server/db";
import { adminTokenState } from "@/server/security";

/**
 * Protects both server-rendered panel pages and API routes in production.
 *
 * Two credentials are accepted:
 *
 *  1. A session cookie, which is what the login screen issues. This is the path a
 *     browser takes.
 *  2. `Authorization: Bearer <token>`, the original machine credential. A reverse
 *     proxy may still inject it so the token never reaches the browser, and
 *     scripts keep working without a login round-trip.
 *
 * The reverse-proxy path is optional, not required: the panel now has an identity
 * of its own, so TLS termination plus a login screen is a complete deployment.
 */
export function proxy(request: Request): NextResponse {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  // The bearer token is checked first so a proxied install never touches the
  // session tables, and a missing token configuration cannot lock out a proxy.
  if (adminTokenState(request) === "ok") return NextResponse.next();

  const state = adminTokenState(request);
  if (state === "missing") {
    return new NextResponse("ISPATLA_ADMIN_TOKEN must be configured for production access", { status: 503 });
  }

  ensureDatabase();
  const parsed = splitSessionCookie(readSessionCookie(request.headers.get("cookie")));
  if (parsed && resolveSession(parsed.id, parsed.signature)) {
    return NextResponse.next();
  }

  // A browser that lands on a panel page with no session is sent to the sign-in
  // screen instead of being shown a bare 401 body. API callers keep the 401:
  // they asked for data, and a redirect to an HTML form would be misleading.
  if (request.headers.get("accept")?.includes("text/html")) {
    const target = new URL("/login", request.url);
    return NextResponse.redirect(target);
  }

  return new NextResponse("admin authorization required", {
    status: 401,
    headers: { "WWW-Authenticate": "Bearer" },
  });
}

export const config = {
  // The sign-in page and the auth endpoints must stay reachable to the very
  // visitor who has no session yet — gating them would loop an unauthenticated
  // request straight back onto a 401 it can never satisfy.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};
