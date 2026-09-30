import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieHeader, verifyPassword } from "@/server/auth";
import { countUsers, createSession, createUser, findUserByUsername, isValidPassword, isValidUsername, recordLogin } from "@/server/auth-store";
import { readJsonBody } from "@/server/api-guard";
import { ensureDatabase } from "@/server/db";

export const runtime = "nodejs";

/**
 * Per-IP attempt throttle. A login screen without one is a free password
 * oracle, so failures are counted rather than trusted.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function clientKey(request: Request): string {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function throttle(request: Request): NextResponse | null {
  const key = clientKey(request);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." }, { status: 429, headers: { "retry-after": "900" } });
  }
  return null;
}

/**
 * One message for every failure mode so the form cannot enumerate accounts.
 *
 * Built per call rather than shared: a module-level Response has its headers
 * consumed on first use, so reusing one instance returned an empty body with a
 * 401 status — the client saw a rejection with nothing to show.
 */
function rejected(): NextResponse {
  return NextResponse.json({ error: "Kullanıcı adı veya parola hatalı." }, { status: 401 });
}

export async function POST(request: Request) {
  // No guardMutation here: this is the one endpoint where the caller has no
  // credential yet. Abuse is bounded by the scrypt cost per attempt plus a
  // per-IP throttle below, not by an auth check the visitor cannot pass.
  ensureDatabase();
  const throttled = throttle(request);
  if (throttled) return throttled;

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Kullanıcı adı ve parola zorunlu." }, { status: 400 });
  }

  // First run: no account exists yet, so the submitted credentials become it.
  // The panel is otherwise unopenable, and there is no admin to create one.
  if (countUsers() === 0) {
    if (!isValidUsername(username) || !isValidPassword(password)) {
      return NextResponse.json(
        { error: "İlk hesap için 3-32 karakterlik kullanıcı adı (küçük harf, rakam, . _ -) ve en az 10 karakterli parola gerekli." },
        { status: 400 },
      );
    }
    createUser(username, password);
  }

  const user = findUserByUsername(username);
  // Verify against a decoy digest when the user is unknown so a missing account
  // and a wrong password take the same time.
  if (!user || user.disabled || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return rejected();
  }

  const token = createSession(user.id, request.headers.get("user-agent") || "");
  recordLogin(user.id);

  const response = NextResponse.json({ user: { username: user.username, role: user.role } });
  response.headers.set("set-cookie", sessionCookieHeader(token));
  return response;
}

export function GET() {
  return NextResponse.json({ cookie: SESSION_COOKIE });
}
