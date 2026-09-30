import { NextResponse } from "next/server";
import { readSessionCookie, splitSessionCookie } from "@/server/auth";
import { resolveSession } from "@/server/auth-store";
import { ensureDatabase } from "@/server/db";

export const runtime = "nodejs";

/**
 * Current-session probe. The login screen calls it to decide between the app and
 * the form, and the proxy calls the same resolution to decide whether to let a
 * request through — so the two can never disagree about who is signed in.
 */
export function GET(request: Request) {
  ensureDatabase();

  const parsed = splitSessionCookie(readSessionCookie(request.headers.get("cookie")));
  if (!parsed) return NextResponse.json({ authenticated: false, user: null });

  const session = resolveSession(parsed.id, parsed.signature);
  if (!session) return NextResponse.json({ authenticated: false, user: null });

  return NextResponse.json({
    authenticated: true,
    user: { username: session.username, role: session.role },
    expiresAt: session.expiresAt,
  });
}
