import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { createAuthRuntime, initializeAuthDatabase } from "../src/server/auth";
import { normalizeEmailAddress } from "../src/server/email-validation";

const dir = mkdtempSync(join(tmpdir(), "ispatla-auth-"));
const mail: Array<{ to: string; subject: string; text: string }> = [];
let mailServer: ReturnType<typeof Bun.serve>;
let runtime: Awaited<ReturnType<typeof createAuthRuntime>>;
let rejectSignupEmail = false;
let signupValidationCalls = 0;
let failSignupValidation = false;

beforeAll(async () => {
  mailServer = Bun.serve({
    port: 0,
    fetch: async (request) => {
      expect(request.headers.get("authorization")).toBe("Bearer test-mail-token");
      mail.push(await request.json() as (typeof mail)[number]);
      return new Response(null, { status: 202 });
    },
  });
  runtime = await createAuthRuntime({
    databasePath: join(dir, "auth.sqlite3"),
    validateSignupEmail: async (email) => {
      signupValidationCalls++;
      if (failSignupValidation) throw new Error("fixture-private-validator-error");
      return rejectSignupEmail
        ? { accepted: false, mxStatus: "invalid", reason: "invalid_domain" }
        : { accepted: true, normalizedEmail: normalizeEmailAddress(email) || email, mxStatus: "valid" };
    },
    env: {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
      ISPATLA_MAIL_API_URL: `http://127.0.0.1:${mailServer.port}/send`,
      ISPATLA_MAIL_API_TOKEN: "test-mail-token",
    },
  });
  await initializeAuthDatabase({
    databasePath: join(dir, "auth.sqlite3"),
    env: {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  });
});

afterAll(() => {
  runtime?.close();
  mailServer?.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

function request(path: string, body?: Record<string, unknown>, cookie?: string): Request {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      origin: "http://localhost:3000",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""];
  return values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

describe("Better Auth DB-backed sessions", () => {
  test("starts an unverified session immediately at signup and verifies email later without crossing owners", async () => {
    const missingEmail = await runtime.handler(request("/sign-up/email", { password: "correct-horse-battery-0" }));
    expect(missingEmail.status).toBe(400);
    expect(cookieHeader(missingEmail)).not.toContain("session_token");
    rejectSignupEmail = true;
    expect((await runtime.handler(request("/sign-up/email", { email: "blocked@example.test", password: "correct-horse-battery-0" }))).status).toBe(400);
    rejectSignupEmail = false;

    const signup1 = await runtime.handler(request("/sign-up/email", { email: "one@example.test", password: "correct-horse-battery-1", owner_user_id: "client-forged-owner" }));
    expect(signup1.status).toBe(200);
    const signupCookie1 = cookieHeader(signup1);
    expect(signupCookie1).not.toBe("");
    const signupSession1 = await (await runtime.handler(request("/get-session", undefined, signupCookie1))).json() as { user: { id: string; email: string; emailVerified: boolean } };
    expect(signupSession1.user.email).toBe("one@example.test");
    expect(signupSession1.user.emailVerified).toBe(false);
    expect(mail.some((item) => item.to === "one@example.test" && item.subject.includes("Verify"))).toBe(false);

    const signup2 = await runtime.handler(request("/sign-up/email", { email: "two@example.test", password: "correct-horse-battery-2" }, signupCookie1));
    expect(signup2.status).toBe(200);
    const signupCookie2 = cookieHeader(signup2);
    expect(signupCookie2).not.toBe("");
    const signupSession2 = await (await runtime.handler(request("/get-session", undefined, signupCookie2))).json() as { user: { id: string; email: string; emailVerified: boolean } };
    expect(signupSession2.user.email).toBe("two@example.test");
    expect(signupSession2.user.emailVerified).toBe(false);
    expect(signupSession2.user.id).not.toBe(signupSession1.user.id);
    expect(mail.some((item) => item.to === "two@example.test" && item.subject.includes("Verify"))).toBe(false);

    const aliasSignup = await runtime.handler(request("/sign-up/email", { email: "First.Last+signup@googlemail.com", password: "correct-horse-battery-3" }));
    expect((await aliasSignup.json() as { user: { email: string } }).user.email).toBe("firstlast@gmail.com");
    expect((await runtime.handler(request("/sign-in/email", { email: "First.Last+signup@googlemail.com", password: "correct-horse-battery-3" }))).status).toBe(200);

    const login1 = await runtime.handler(request("/sign-in/email", { email: "one@example.test", password: "correct-horse-battery-1" }));
    const login2 = await runtime.handler(request("/sign-in/email", { email: "two@example.test", password: "correct-horse-battery-2" }));
    expect(login1.status).toBe(200);
    expect(login2.status).toBe(200);
    const cookie1 = cookieHeader(login1);
    const cookie2 = cookieHeader(login2);
    expect(cookie1).not.toBe("");
    expect(cookie2).not.toBe("");
    const setCookies = (login1.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [login1.headers.get("set-cookie") || ""];
    const sessionCookie = setCookies.find((value) => value.includes("session_token")) || "";
    expect(sessionCookie.toLowerCase()).toContain("httponly");
    expect(sessionCookie.toLowerCase()).toContain("samesite=lax");
    expect(sessionCookie.toLowerCase()).toContain("path=/");

    const session1 = await runtime.handler(request("/get-session", undefined, cookie1));
    const session2 = await runtime.handler(request("/get-session", undefined, cookie2));
    const body1 = await session1.json() as { user: { id: string; email: string; name: string; emailVerified: boolean } };
    const body2 = await session2.json() as { user: { id: string; email: string; name: string; emailVerified: boolean } };
    expect(body1.user.email).toBe("one@example.test");
    expect(body2.user.email).toBe("two@example.test");
    expect(body1.user.id).not.toBe(body2.user.id);
    expect(body1.user.id).toBe(signupSession1.user.id);
    expect(body2.user.id).toBe(signupSession2.user.id);
    expect(body1.user.name).toBe("one");
    expect(body1.user.emailVerified).toBe(false);
    expect(body2.user.emailVerified).toBe(false);

    expect((await runtime.handler(request("/send-verification-email", { email: "two@example.test" }, cookie1))).status).toBe(400);
    expect((await runtime.handler(request("/send-verification-email", { email: "one@example.test" }, cookie1))).status).toBe(200);
    const verification1 = mail.find((item) => item.to === "one@example.test" && item.subject.includes("Verify"));
    expect(verification1).toBeTruthy();
    const verificationUrl = new URL(verification1!.text.slice(verification1!.text.indexOf("http")));
    expect((await runtime.handler(new Request(verificationUrl))).status).toBe(302);
    expect((await runtime.handler(new Request(verificationUrl))).status).toBe(400);
    const verified = await runtime.handler(request("/get-session", undefined, cookie1));
    expect((await verified.json() as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true);
    expect((await runtime.handler(request("/get-session", undefined, cookie2)).then((response) => response.json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(false);

    expect((await runtime.handler(request("/sign-out", {}, cookie1))).status).toBe(200);
    expect(await (await runtime.handler(request("/get-session", undefined, cookie1))).json()).toBeNull();
    expect((await runtime.handler(new Request("http://localhost:3000/api/auth/sign-out", {
      method: "POST", headers: { origin: "http://localhost:3000", cookie: cookie1 },
    }))).status).toBe(200);
    expect((await runtime.handler(request("/get-session", undefined, cookie2))).status).toBe(200);

    runtime.disableUser(signupSession2.user.id, Math.floor(Date.now() / 1000));
    expect(runtime.isUserDisabled(signupSession2.user.id)).toBe(true);
    expect(await (await runtime.handler(request("/get-session", undefined, cookie2))).json()).toBeNull();
    const reactivatedLogin = await runtime.handler(request("/sign-in/email", { email: "two@example.test", password: "correct-horse-battery-2" }));
    expect(reactivatedLogin.status).toBe(200);
    const reactivatedCookie = cookieHeader(reactivatedLogin);
    expect(runtime.isUserDisabled(signupSession2.user.id)).toBe(false);
    expect((await runtime.handler(request("/get-session", undefined, reactivatedCookie))).status).toBe(200);

    const resetRequest = await runtime.handler(request("/request-password-reset", { email: "two@example.test", redirectTo: "http://localhost:3000/login" }));
    expect(resetRequest.status).toBe(200);
    const resetMail = mail.findLast((item) => item.to === "two@example.test" && item.subject.includes("Reset"));
    expect(resetMail).toBeTruthy();
    const resetUrl = new URL(resetMail!.text.slice(resetMail!.text.indexOf("http")));
    const resetToken = resetUrl.pathname.split("/").filter(Boolean).at(-1) || "";
    const reset = await runtime.handler(request("/reset-password", { newPassword: "new-correct-horse-2", token: resetToken }));
    expect(reset.status).toBe(200);
    expect(await (await runtime.handler(request("/get-session", undefined, signupCookie2))).json()).toBeNull();
    expect((await (await runtime.handler(request("/get-session", undefined, signupCookie1))).json() as { user: { email: string } }).user.email).toBe("one@example.test");
    expect((await runtime.handler(request("/sign-in/email", { email: "two@example.test", password: "correct-horse-battery-2" }))).status).not.toBe(200);
    expect(await (await runtime.handler(request("/get-session", undefined, cookie2))).json()).toBeNull();
    const newLogin = await runtime.handler(request("/sign-in/email", { email: "two@example.test", password: "new-correct-horse-2" }));
    expect(newLogin.status).toBe(200);
    const db = new Database(join(dir, "auth.sqlite3"));
    const signals = db.query("SELECT * FROM auth_abuse_signup_signals ORDER BY created_at,id").all() as Array<{ owner_user_id: string | null; email_hash: string | null; device_hash: string | null; outcome: string }>;
    expect(signals.filter((signal) => signal.outcome === "success").map((signal) => signal.owner_user_id)).toContain(signupSession1.user.id);
    expect(signals.filter((signal) => signal.outcome === "success").map((signal) => signal.owner_user_id)).toContain(signupSession2.user.id);
    expect(signals.some((signal) => signal.outcome === "failed" && signal.owner_user_id === null)).toBe(true);
    expect(JSON.stringify(signals)).not.toContain("one@example.test");
    expect(JSON.stringify(signals)).not.toContain("client-forged-owner");
    expect(JSON.stringify(signals)).not.toContain(signupCookie1);
    const deviceCookie = (signup1.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.().find((value) => value.startsWith("ispatla-device=")) || "";
    expect(deviceCookie).toContain("HttpOnly");
    expect(deviceCookie).toContain("SameSite=Lax");
    expect(deviceCookie).toContain("Max-Age=2592000");
    try { db.exec('UPDATE session SET expiresAt=0'); } finally { db.close(); }
    expect(await (await runtime.handler(request("/get-session", undefined, cookieHeader(newLogin)))).json()).toBeNull();
    expect(await (await runtime.handler(request("/get-session", undefined, "better-auth.session_token=forged"))).json()).toBeNull();
    const hostile = new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ email: "two@example.test", password: "new-correct-horse-2" }),
    });
    expect((await runtime.handler(hostile)).status).toBe(403);
  });
});

test("rejects oversized and malformed auth bodies before email validation or account creation", async () => {
  const db = new Database(join(dir, "auth.sqlite3"));
  const before = db.query('SELECT COUNT(*) AS count FROM user').get() as { count: number };
  const beforeValidation = signupValidationCalls;
  const cases = [
    { body: JSON.stringify({ email: "large@example.test", password: "correct-horse-battery-4", padding: "x".repeat(17000) }), status: 413 },
    { body: JSON.stringify({ email: "large@example.test", password: "correct-horse-battery-4" }), length: "17000", status: 413 },
    { body: "{", status: 400 },
    { body: "[]", status: 400 },
    { body: "null", status: 400 },
  ];
  try {
    for (const item of cases) {
      const response = await runtime.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...(item.length ? { "content-length": item.length } : {}) }, body: item.body,
      }));
      expect(response.status).toBe(item.status);
      expect(cookieHeader(response)).not.toContain("session_token");
    }
    expect(db.query('SELECT COUNT(*) AS count FROM user').get()).toEqual(before);
    expect(signupValidationCalls).toBe(beforeValidation);
    expect(db.query("SELECT COUNT(*) AS count FROM auth_abuse_signup_signals WHERE outcome='pending'").get()).toEqual({ count: 0 });
  } finally { db.close(); }
});

test("signup fails temporarily before creating an account when the shared risk store cannot record the attempt", async () => {
  const db = new Database(join(dir, "auth.sqlite3"));
  const before = db.query('SELECT COUNT(*) AS count FROM user').get();
  db.exec("CREATE TRIGGER fixture_abuse_unavailable BEFORE INSERT ON auth_abuse_signup_signals BEGIN SELECT RAISE(ABORT,'fixture unavailable'); END;");
  try {
    const response = await runtime.handler(request("/sign-up/email", { email: "unavailable@example.test", password: "correct-horse-battery-4" }));
    expect(response.status).toBe(503);
    expect(cookieHeader(response)).not.toContain("session_token");
    expect(await response.text()).not.toContain("fixture unavailable");
    expect(db.query('SELECT COUNT(*) AS count FROM user').get()).toEqual(before);
  } finally { db.exec("DROP TRIGGER fixture_abuse_unavailable"); db.close(); }
});

test("unexpected email validator failure cannot fall through to account creation", async () => {
  const db = new Database(join(dir, "auth.sqlite3"));
  const before = db.query('SELECT COUNT(*) AS count FROM user').get();
  failSignupValidation = true;
  try {
    const response = await runtime.handler(request("/sign-up/email", { email: "validator-failure@example.test", password: "correct-horse-battery-4" }));
    expect(response.status).toBe(503);
    expect(cookieHeader(response)).not.toContain("session_token");
    expect(await response.text()).not.toContain("fixture-private-validator-error");
    expect(db.query('SELECT COUNT(*) AS count FROM user').get()).toEqual(before);
  } finally { failSignupValidation = false; db.close(); }
});

test("email-quality rejection cannot bypass signup admission; spoofed network headers do not change the bucket", async () => {
  rejectSignupEmail = true;
  const before = signupValidationCalls;
  try {
    for (let index = 0; index < 10; index++) {
      const response = await runtime.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": `198.51.100.${index}`, "x-real-ip": `203.0.113.${index}` },
        body: JSON.stringify({ email: "rejected-limit@example.test", password: "correct-horse-battery-5" }),
      }));
      expect(response.status).toBe(index < 5 ? 400 : 429);
      if (index >= 5) expect(response.headers.get("retry-after")).toBe("60");
    }
    expect(signupValidationCalls - before).toBe(5);
  } finally { rejectSignupEmail = false; }
});

test("shared signup route admission bounds changing-address and oversized preflight requests", async () => {
  let validations = 0;
  const path = join(dir, "signup-admission.sqlite3");
  const limited = await createAuthRuntime({ databasePath: path, env: { NODE_ENV: "test", BETTER_AUTH_SECRET: "admission-secret-that-is-at-least-32-characters", BETTER_AUTH_URL: "http://localhost:3000" }, validateSignupEmail: async () => { validations++; return { accepted: false, mxStatus: "invalid", reason: "invalid_domain" }; } });
  const db = new Database(path);
  try {
    for (let index = 0; index < 100; index++) {
      const response = await limited.handler(request("/sign-up/email", { email: `different-${index}@example.test`, password: "correct-horse-battery-5" }));
      expect(response.status).toBe(400);
    }
    const blocked = await limited.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": "192.0.2.250" }, body: "x".repeat(17000),
    }));
    expect(blocked.status).toBe(429);
    expect(validations).toBe(100);
    expect(db.query("SELECT COUNT(*) AS count FROM auth_abuse_signup_signals").get()).toEqual({ count: 100 });
    expect(db.query('SELECT COUNT(*) AS count FROM user').get()).toEqual({ count: 0 });
    const keys = db.query("SELECT key FROM auth_signup_admission").all();
    expect(JSON.stringify(keys)).not.toContain("example.test");
    db.exec("UPDATE auth_signup_admission SET window_started_at=0");
    expect((await limited.handler(request("/sign-up/email", { email: "new-window@example.test", password: "correct-horse-battery-5" }))).status).toBe(400);
    expect(validations).toBe(101);
  } finally { db.close(); limited.close(); }
});
