import { NextResponse } from "next/server";
import { clearedSessionCookieHeader, readSessionCookie, splitSessionCookie } from "@/server/auth";
import { revokeSession } from "@/server/auth-store";
import { guardMutation } from "@/server/api-guard";
import { ensureDatabase } from "@/server/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;

  ensureDatabase();

  const parsed = splitSessionCookie(readSessionCookie(request.headers.get("cookie")));
  if (parsed) revokeSession(parsed.id);

  const response = NextResponse.json({ ok: true });
  // Always clear: a caller without a cookie must still end up cookie-less.
  response.headers.set("set-cookie", clearedSessionCookieHeader());
  return response;
}
