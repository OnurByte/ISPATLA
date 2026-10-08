import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { createAuthRuntime } from "../src/server/auth";

const directory = mkdtempSync(join(tmpdir(), "ispatla-x-login-"));
const mail: Array<{ to: string; subject: string; text: string }> = [];
let mailServer: ReturnType<typeof Bun.serve>;
let runtime: Awaited<ReturnType<typeof createAuthRuntime>>;
let profileHasEmail = true;
let profileId = "18446744073709551615";
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  mailServer = Bun.serve({ port: 0, fetch: async (request) => { mail.push(await request.json() as (typeof mail)[number]); return new Response(null, { status: 202 }); } });
  runtime = await createAuthRuntime({
    databasePath: join(directory, "auth.sqlite3"),
    validateSignupEmail: async (email) => ({ accepted: true, normalizedEmail: email, mxStatus: "valid" }),
    env: {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
      X_OAUTH_CLIENT_ID: "fixture-client-id",
      X_OAUTH_CLIENT_SECRET: "fixture-client-secret",
      ISPATLA_MAIL_API_URL: `http://127.0.0.1:${mailServer.port}/send`,
      ISPATLA_MAIL_API_TOKEN: "test-mail-token",
    },
  });
  globalThis.fetch = (async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.href === "https://api.x.com/2/oauth2/token") return Response.json({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_in: 3600, scope: "users.read users.email", token_type: "bearer" });
    if (url.origin === "https://api.x.com" && url.pathname === "/2/users/me") {
      const data = { id: profileId, name: "Fixture X User", username: "fixture_x", ...(profileHasEmail ? { confirmed_email: "x-user@example.test" } : {}) };
      return Response.json({ data });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  runtime?.close();
  mailServer?.stop(true);
  rmSync(directory, { recursive: true, force: true });
});

function authRequest(path: string, body?: Record<string, unknown>, cookie?: string): Request {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: { origin: "http://localhost:3000", ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""]).map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function startXLogin(callbackURL = "/app") {
  const response = await runtime.handler(authRequest("/sign-in/social", { provider: "twitter", callbackURL, errorCallbackURL: "/login?x_error=1" }));
  expect(response.status).toBe(200);
  const { url } = await response.json() as { url: string };
  const authorizeURL = new URL(url);
  expect(authorizeURL.origin).toBe("https://x.com");
  expect(authorizeURL.pathname).toBe("/i/oauth2/authorize");
  const scopes = new Set((authorizeURL.searchParams.get("scope") || "").split(" "));
  expect(scopes).toEqual(new Set(["users.read", "users.email"]));
  return { authorizeURL, cookie: cookieHeader(response) };
}

async function finishXLogin(authorizeURL: URL, cookie: string): Promise<Response> {
  const callbackURL = new URL(authorizeURL.searchParams.get("redirect_uri")!);
  callbackURL.searchParams.set("state", authorizeURL.searchParams.get("state")!);
  callbackURL.searchParams.set("code", "fixture-code");
  return runtime.handler(new Request(callbackURL, { headers: { cookie } }));
}

async function startXLink(sessionCookie: string, callbackURL = "/app/settings/security") {
  const response = await runtime.handler(authRequest("/link-social", { provider: "twitter", callbackURL, errorCallbackURL: "/app/settings/security?x_error=1" }, sessionCookie));
  expect(response.status).toBe(200);
  const { url } = await response.json() as { url: string };
  const authorizeURL = new URL(url);
  expect(new Set((authorizeURL.searchParams.get("scope") || "").split(" "))).toEqual(new Set(["users.read", "users.email"]));
  return { authorizeURL, cookie: `${sessionCookie}; ${cookieHeader(response)}` };
}

describe("X sign-in identity is separate from publishing consent", () => {
  test("uses minimal identity scopes, requires a confirmed email, and stores no X publishing tokens", async () => {
    const started = await startXLogin();
    expect(started.cookie).not.toBe("");
    const callback = await finishXLogin(started.authorizeURL, started.cookie);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/app");
    const session = await runtime.handler(new Request("http://localhost:3000/api/auth/get-session", { headers: { cookie: cookieHeader(callback) } }));
    expect((await session.json() as { user?: { email?: string } }).user?.email).toBe("x-user@example.test");
    const replay = await finishXLogin(started.authorizeURL, started.cookie);
    expect(replay.headers.get("location")).toContain("error=state_mismatch");

    const db = new Database(join(directory, "auth.sqlite3"));
    try {
      const account = db.query("SELECT userId, providerId, accountId, accessToken, refreshToken, scope FROM account WHERE providerId='twitter'").get() as Record<string, unknown>;
      const user = db.query("SELECT email, emailVerified FROM user WHERE id=?").get(String(account.userId)) as Record<string, unknown>;
      expect(account).toMatchObject({ providerId: "twitter", accountId: "18446744073709551615", accessToken: null, refreshToken: null, scope: null });
      expect(user).toEqual({ email: "x-user@example.test", emailVerified: 1 });
      expect(db.query("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('x_oauth_accounts','accounts')").get()).toEqual({ count: 0 });
    } finally { db.close(); }

    profileHasEmail = false;
    const missingEmail = await startXLogin();
    const rejected = await finishXLogin(missingEmail.authorizeURL, missingEmail.cookie);
    expect(rejected.status).toBe(302);
    expect(rejected.headers.get("location")).toContain("x_error=1");
    const verify = new Database(join(directory, "auth.sqlite3"));
    try {
      expect(verify.query("SELECT count(*) AS count FROM user").get()).toEqual({ count: 1 });
      expect(verify.query("SELECT count(*) AS count FROM user WHERE email LIKE '%placeholder.invalid'").get()).toEqual({ count: 0 });
    } finally { verify.close(); }

    profileHasEmail = true;
    const emailSignup = await runtime.handler(authRequest("/sign-up/email", { email: "email-owner@example.test", password: "email-owner-password-1" }));
    expect(emailSignup.status).toBe(200);
    const emailLogin = await runtime.handler(authRequest("/sign-in/email", { email: "email-owner@example.test", password: "email-owner-password-1" }));
    const emailUser = (await emailSignup.json() as { user: { id: string } }).user;
    const sessionCookie = cookieHeader(emailLogin);
    expect(sessionCookie).not.toBe("");

    profileId = "2000000000000000001";
    const linked = await startXLink(sessionCookie);
    const linkCallback = await finishXLogin(linked.authorizeURL, linked.cookie);
    expect(linkCallback.status).toBe(302);
    expect(linkCallback.headers.get("location")).toBe("/app/settings/security");
    const linkDb = new Database(join(directory, "auth.sqlite3"));
    try {
      const linkedAccount = linkDb.query("SELECT userId, providerId, accountId, accessToken, refreshToken, scope FROM account WHERE providerId='twitter' AND accountId=?").get(profileId) as Record<string, unknown>;
      expect(linkedAccount).toMatchObject({ userId: emailUser.id, providerId: "twitter", accessToken: null, refreshToken: null, scope: null });
    } finally { linkDb.close(); }

    profileId = "18446744073709551615";
    const collision = await startXLink(sessionCookie);
    const collisionCallback = await finishXLogin(collision.authorizeURL, collision.cookie);
    expect(collisionCallback.status).toBe(302);
    expect(collisionCallback.headers.get("location")).toContain("x_error=1");
    const finalDb = new Database(join(directory, "auth.sqlite3"));
    try {
      const original = finalDb.query("SELECT userId FROM account WHERE providerId='twitter' AND accountId=?").get(profileId) as { userId: string };
      expect(original.userId).not.toBe(emailUser.id);
    } finally { finalDb.close(); }
  });

  test("X identity linking requires a current session", async () => {
    const anonymous = await runtime.handler(authRequest("/link-social", { provider: "twitter", callbackURL: "/app/settings/security" }));
    expect(anonymous.status).toBe(401);
    profileHasEmail = true;
  });
});
