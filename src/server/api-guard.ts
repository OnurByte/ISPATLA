import { NextResponse } from "next/server";
import { readSessionCookie, splitSessionCookie } from "./auth";
import { resolveSession } from "./auth-store";
import { adminTokenState } from "./security";

/** True when the request carries a valid, unexpired, non-disabled session cookie. */
export function hasLiveSession(request: Request): boolean {
  const parsed = splitSessionCookie(readSessionCookie(request.headers.get("cookie")));
  if (!parsed) return false;
  try {
    return resolveSession(parsed.id, parsed.signature) !== null;
  } catch {
    // The database may not be open yet; fall back to the bearer decision.
    return false;
  }
}

let lastMutationAt = 0;

const MAX_JSON_BODY_BYTES = 1024 * 1024;

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) {
    throw new Error("JSON body exceeds 1 MiB");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BODY_BYTES) {
    throw new Error("JSON body exceeds 1 MiB");
  }
  const parsed = text.trim() ? JSON.parse(text) : {};
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

/**
 * Accepts either credential: the admin bearer token, or a live session cookie.
 *
 * The bearer check stays authoritative for non-browser clients, but a signed-in
 * browser holds no token, so a session must satisfy the guard too — otherwise
 * every mutation from the panel would 401 while the read routes worked.
 */
export function guardMutation(request: Request, rateLimited = false): NextResponse | null {
  const auth = adminTokenState(request);
  if (auth === "ok" || hasLiveSession(request)) {
    // fall through to the rate limiter below
  } else if (auth === "missing") {
    return NextResponse.json(
      { error: "ISPATLA_ADMIN_TOKEN must be configured for production mutations" },
      { status: 503 },
    );
  } else {
    return NextResponse.json(
      { error: "admin authorization required" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  if (rateLimited && process.env.NODE_ENV === "production") {
    const now = Date.now();
    if (now - lastMutationAt < 15_000) {
      return NextResponse.json(
        { error: "mutation rate limit exceeded; retry after 15 seconds" },
        { status: 429, headers: { "Retry-After": "15" } },
      );
    }
    lastMutationAt = now;
  }
  return null;
}
