import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { createAuthRuntime, initializeAuthDatabase } from "../src/server/auth";

const dir = mkdtempSync(join(tmpdir(), "ispatla-auth-"));
const mail: Array<{ to: string; subject: string; text: string }> = [];
let mailServer: ReturnType<typeof Bun.serve>;
let runtime: Awaited<ReturnType<typeof createAuthRuntime>>;

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
  test("verifies email, isolates two sessions, logs out, and resets a password", async () => {
    const signup1 = await runtime.handler(request("/sign-up/email", { email: "one@example.test", password: "correct-horse-battery-1" }));
    expect(signup1.status).toBe(200);
    const verification1 = mail.find((item) => item.to === "one@example.test" && item.subject.includes("Verify"));
    expect(verification1).toBeTruthy();
    expect((await runtime.handler(new Request(new URL(verification1!.text.slice(verification1!.text.indexOf("http")))))).status).toBe(302);

    const signup2 = await runtime.handler(request("/sign-up/email", { email: "two@example.test", password: "correct-horse-battery-2" }));
    expect(signup2.status).toBe(200);
    const verification2 = mail.find((item) => item.to === "two@example.test" && item.subject.includes("Verify"));
    expect(verification2).toBeTruthy();
    expect((await runtime.handler(new Request(new URL(verification2!.text.slice(verification2!.text.indexOf("http")))))).status).toBe(302);

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

    const session1 = await runtime.handler(request("/get-session", undefined, cookie1));
    const session2 = await runtime.handler(request("/get-session", undefined, cookie2));
    const body1 = await session1.json() as { user: { id: string; email: string; name: string } };
    const body2 = await session2.json() as { user: { id: string; email: string; name: string } };
    expect(body1.user.email).toBe("one@example.test");
    expect(body2.user.email).toBe("two@example.test");
    expect(body1.user.id).not.toBe(body2.user.id);
    expect(body1.user.name).toBe("one");

    expect((await runtime.handler(request("/sign-out", {}, cookie1))).status).toBe(200);
    expect(await (await runtime.handler(request("/get-session", undefined, cookie1))).json()).toBeNull();
    expect((await runtime.handler(request("/get-session", undefined, cookie2))).status).toBe(200);

    const resetRequest = await runtime.handler(request("/request-password-reset", { email: "two@example.test", redirectTo: "http://localhost:3000/login" }));
    expect(resetRequest.status).toBe(200);
    const resetMail = mail.findLast((item) => item.to === "two@example.test" && item.subject.includes("Reset"));
    expect(resetMail).toBeTruthy();
    const resetUrl = new URL(resetMail!.text.slice(resetMail!.text.indexOf("http")));
    const resetToken = resetUrl.pathname.split("/").filter(Boolean).at(-1) || "";
    const reset = await runtime.handler(request("/reset-password", { newPassword: "new-correct-horse-2", token: resetToken }));
    expect(reset.status).toBe(200);
    expect((await runtime.handler(request("/sign-in/email", { email: "two@example.test", password: "correct-horse-battery-2" }))).status).not.toBe(200);
    expect(await (await runtime.handler(request("/get-session", undefined, cookie2))).json()).toBeNull();
    const newLogin = await runtime.handler(request("/sign-in/email", { email: "two@example.test", password: "new-correct-horse-2" }));
    expect(newLogin.status).toBe(200);
    const db = new Database(join(dir, "auth.sqlite3"));
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
