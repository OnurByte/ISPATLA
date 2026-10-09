import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

if (process.env.ISPATLA_X_LOGIN_TEST_CHILD !== "1") {
  const root = mkdtempSync(join(tmpdir(), "ispatla-x-login-run-"));
  const result = Bun.spawnSync([process.execPath, "test", "tests/x-login.test.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISPATLA_X_LOGIN_TEST_CHILD: "1", ISPATLA_DB: join(root, "isolated.sqlite3"),
      ISPATLA_TOKEN_KEY_CURRENT: "isolated-test-token-key-with-more-than-32-characters" },
  });
  const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
  rmSync(root, { recursive: true, force: true });
  test("X login provisions owned publishing accounts in an isolated SQLite database", () => {
    expect(result.exitCode, output).toBe(0);
    expect(output).toContain("2 pass");
    expect(output).toContain("0 fail");
  });
} else {

const directory = mkdtempSync(join(tmpdir(), "ispatla-x-login-"));
const databasePath = join(directory, "auth.sqlite3");
const oldDatabasePath = process.env.ISPATLA_DB;
const oldTokenKey = process.env.ISPATLA_TOKEN_KEY_CURRENT;
process.env.ISPATLA_DB = databasePath;
process.env.ISPATLA_TOKEN_KEY_CURRENT = "test-token-encryption-key-with-more-than-32-characters";
const { createAuthRuntime } = await import("../src/server/auth");
const { connectXAccount, getXCredential } = await import("../src/server/x-oauth-store");
const xScopes = ["tweet.read", "tweet.write", "users.read", "users.email", "media.write", "offline.access"];
const mail: Array<{ to: string; subject: string; text: string }> = [];
let mailServer: ReturnType<typeof Bun.serve>;
let runtime: Awaited<ReturnType<typeof createAuthRuntime>>;
let profileHasEmail = true;
let profileId = "18446744073709551615";
let omitRefreshToken = false;
let omitPublishingScope = false;
let tokenGeneration = 0;
let invalidUsername = false;
let avatarFetches = 0;
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
      ISPATLA_DB: databasePath,
      ISPATLA_TOKEN_KEY_CURRENT: "test-token-encryption-key-with-more-than-32-characters",
      ISPATLA_MAIL_API_URL: `http://127.0.0.1:${mailServer.port}/send`,
      ISPATLA_MAIL_API_TOKEN: "test-mail-token",
    },
  });
  globalThis.fetch = (async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.href === "https://api.x.com/2/oauth2/token") return Response.json({ access_token: `fixture-access-token-${tokenGeneration}`, ...(omitRefreshToken ? {} : { refresh_token: `fixture-refresh-token-${tokenGeneration}` }), expires_in: 3600, scope: xScopes.filter((scope) => !(omitPublishingScope && scope === "tweet.write")).join(" "), token_type: "bearer" });
    if (url.origin === "https://api.x.com" && url.pathname === "/2/users/me") {
      const data = { id: profileId, name: "Fixture X User", username: invalidUsername ? "invalid handle" : `fixture_${profileId.slice(-4)}`, description: "Official profile bio", profile_image_url: "https://pbs.twimg.com/profile_images/fixture/avatar.png", protected: false, ...(profileHasEmail ? { confirmed_email: `x-${profileId.slice(-4)}@example.test` } : {}) };
      return Response.json({ data });
    }
    if (url.origin === "https://pbs.twimg.com") {
      avatarFetches++;
      return new Response(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), { headers: { "content-type": "image/png" } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  runtime?.close();
  mailServer?.stop(true);
  rmSync(directory, { recursive: true, force: true });
  if (oldDatabasePath === undefined) delete process.env.ISPATLA_DB;
  else process.env.ISPATLA_DB = oldDatabasePath;
  if (oldTokenKey === undefined) delete process.env.ISPATLA_TOKEN_KEY_CURRENT;
  else process.env.ISPATLA_TOKEN_KEY_CURRENT = oldTokenKey;
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

async function startXLogin(callbackURL = "/dashboard") {
  const response = await runtime.handler(authRequest("/sign-in/social", { provider: "twitter", callbackURL, errorCallbackURL: "/login?x_error=1" }));
  expect(response.status).toBe(200);
  const { url } = await response.json() as { url: string };
  const authorizeURL = new URL(url);
  expect(authorizeURL.origin).toBe("https://x.com");
  expect(authorizeURL.pathname).toBe("/i/oauth2/authorize");
  const scopes = new Set((authorizeURL.searchParams.get("scope") || "").split(" "));
  expect(scopes).toEqual(new Set(xScopes));
  return { authorizeURL, cookie: cookieHeader(response) };
}

async function finishXLogin(authorizeURL: URL, cookie: string): Promise<Response> {
  const callbackURL = new URL(authorizeURL.searchParams.get("redirect_uri")!);
  callbackURL.searchParams.set("state", authorizeURL.searchParams.get("state")!);
  callbackURL.searchParams.set("code", "fixture-code");
  return runtime.handler(new Request(callbackURL, { headers: { cookie } }));
}

async function startXLink(sessionCookie: string, callbackURL = "/settings/security") {
  const response = await runtime.handler(authRequest("/link-social", { provider: "twitter", callbackURL, errorCallbackURL: "/settings/security?x_error=1" }, sessionCookie));
  expect(response.status).toBe(200);
  const { url } = await response.json() as { url: string };
  const authorizeURL = new URL(url);
  expect(new Set((authorizeURL.searchParams.get("scope") || "").split(" "))).toEqual(new Set(xScopes));
  return { authorizeURL, cookie: `${sessionCookie}; ${cookieHeader(response)}` };
}

describe("X sign-in provisions the publishing connection without automation consent", () => {
  test("uses publishing scopes, requires confirmed email, encrypts tokens, and renews them on repeat login", async () => {
    const started = await startXLogin();
    expect(started.cookie).not.toBe("");
    const callback = await finishXLogin(started.authorizeURL, started.cookie);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/dashboard");
    const session = await runtime.handler(new Request("http://localhost:3000/api/auth/get-session", { headers: { cookie: cookieHeader(callback) } }));
    expect((await session.json() as { user?: { email?: string } }).user?.email).toBe(`x-${profileId.slice(-4)}@example.test`);
    const replay = await finishXLogin(started.authorizeURL, started.cookie);
    expect(replay.headers.get("location")).toContain("error=state_mismatch");

    expect(avatarFetches).toBe(1);
    const db = new Database(databasePath);
    try {
      const account = db.query("SELECT userId, providerId, accountId, accessToken, refreshToken, idToken, scope, accessTokenExpiresAt, refreshTokenExpiresAt FROM account WHERE providerId='twitter'").get() as Record<string, unknown>;
      const user = db.query("SELECT email, emailVerified, image FROM user WHERE id=?").get(String(account.userId)) as Record<string, unknown>;
      expect(account).toMatchObject({ providerId: "twitter", accountId: "18446744073709551615", accessToken: null, refreshToken: null, idToken: null, scope: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null });
      expect(user).toEqual({ email: `x-${profileId.slice(-4)}@example.test`, emailVerified: 1, image: null });
      const appAccount = db.query("SELECT a.owner_user_id,c.encrypted_access_token,c.encrypted_refresh_token,c.scopes_json FROM x_oauth_accounts a JOIN x_oauth_credentials c USING(account_id) WHERE a.x_user_id=?").get(profileId) as Record<string, unknown>;
      expect(appAccount.owner_user_id).toBe(account.userId);
      expect(String(appAccount.encrypted_access_token)).not.toContain("fixture-access-token-0");
      expect(String(appAccount.encrypted_refresh_token)).not.toContain("fixture-refresh-token-0");
      expect(JSON.parse(String(appAccount.scopes_json))).toEqual(xScopes);
      expect(db.query("SELECT count(*) AS count FROM accounts WHERE owner_user_id=?").get(String(account.userId))).toEqual({ count: 1 });
      const syncedProfile = db.query("SELECT x_handle,display_name,bio,avatar_url,visibility,onboarding_completed FROM user_profiles WHERE owner_user_id=?").get(String(account.userId)) as Record<string, unknown>;
      expect(syncedProfile).toEqual({ x_handle: `fixture_${profileId.slice(-4)}`, display_name: "Fixture X User", bio: "Official profile bio", avatar_url: `/api/profile/avatar/${profileId}`, visibility: "public", onboarding_completed: 0 });
      expect(db.query("SELECT DISTINCT mode FROM automation_consents WHERE owner_user_id=?").all(String(account.userId))).toEqual([{ mode: "shadow" }]);
    } finally { db.close(); }

    tokenGeneration = 1;
    const renewed = await startXLogin();
    const renewedCallback = await finishXLogin(renewed.authorizeURL, renewed.cookie);
    expect(renewedCallback.status).toBe(302);
    expect(avatarFetches).toBe(2);
    const renewalDb = new Database(databasePath);
    try {
      expect(renewalDb.query("SELECT count(*) AS count FROM accounts WHERE owner_user_id=(SELECT userId FROM account WHERE providerId='twitter' AND accountId=?)").get(profileId)).toEqual({ count: 1 });
      const appAccount = renewalDb.query("SELECT account_id,owner_user_id FROM x_oauth_accounts WHERE x_user_id=?").get(profileId) as { account_id: number; owner_user_id: string };
      const stored = renewalDb.query("SELECT encrypted_access_token,encrypted_refresh_token FROM x_oauth_credentials WHERE account_id=?").get(appAccount.account_id) as Record<string, unknown>;
      expect(String(stored.encrypted_access_token)).not.toContain("fixture-access-token-1");
      expect(String(stored.encrypted_refresh_token)).not.toContain("fixture-refresh-token-1");
      expect(getXCredential(appAccount.account_id, appAccount.owner_user_id, databasePath)).toMatchObject({ accessToken: "fixture-access-token-1", refreshToken: "fixture-refresh-token-1" });
      expect(renewalDb.query("SELECT accessToken,refreshToken,idToken,scope,accessTokenExpiresAt,refreshTokenExpiresAt FROM account WHERE providerId='twitter' AND accountId=?").get(profileId)).toEqual({ accessToken: null, refreshToken: null, idToken: null, scope: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null });
    } finally { renewalDb.close(); }

    profileHasEmail = false;
    const missingEmail = await startXLogin();
    const rejected = await finishXLogin(missingEmail.authorizeURL, missingEmail.cookie);
    expect(rejected.status).toBe(302);
    expect(rejected.headers.get("location")).toContain("x_error=1");
    const verify = new Database(databasePath);
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
    expect(linkCallback.headers.get("location")).toBe("/settings/security");
    const linkDb = new Database(databasePath);
    try {
      const linkedAccount = linkDb.query("SELECT userId, providerId, accountId, accessToken, refreshToken, scope FROM account WHERE providerId='twitter' AND accountId=?").get(profileId) as Record<string, unknown>;
      expect(linkedAccount).toMatchObject({ userId: emailUser.id, providerId: "twitter", accessToken: null, refreshToken: null, scope: null });
    } finally { linkDb.close(); }
    expect(avatarFetches).toBe(3);

    profileId = "18446744073709551615";
    const collision = await startXLink(sessionCookie);
    const collisionCallback = await finishXLogin(collision.authorizeURL, collision.cookie);
    expect(collisionCallback.status).toBe(302);
    expect(collisionCallback.headers.get("location")).toContain("x_error=1");
    const finalDb = new Database(databasePath);
    try {
      const original = finalDb.query("SELECT userId FROM account WHERE providerId='twitter' AND accountId=?").get(profileId) as { userId: string };
      expect(original.userId).not.toBe(emailUser.id);
    } finally { finalDb.close(); }

    connectXAccount({ ownerUserId: "existing-owner", xUserId: "3000000000000000002", handle: "owned_elsewhere", accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 9999999999, scopes: xScopes, databasePath });
    profileId = "3000000000000000002";
    const conflictingLogin = await startXLogin();
    const conflictingCallback = await finishXLogin(conflictingLogin.authorizeURL, conflictingLogin.cookie);
    expect(conflictingCallback.status).toBe(302);
    expect(conflictingCallback.headers.get("location")).toContain("x_error=1");
    const conflictDb = new Database(databasePath);
    try {
      expect(conflictDb.query("SELECT owner_user_id FROM x_oauth_accounts WHERE x_user_id=?").get(profileId)).toEqual({ owner_user_id: "existing-owner" });
      expect(conflictDb.query("SELECT count(*) AS count FROM account WHERE providerId='twitter' AND accountId=?").get(profileId)).toEqual({ count: 0 });
      expect(conflictDb.query("SELECT count(*) AS count FROM user WHERE email=?").get("x-0002@example.test")).toEqual({ count: 0 });
    } finally { conflictDb.close(); }

    profileId = "4000000000000000003";
    omitRefreshToken = true;
    const missingRefresh = await startXLogin();
    const missingRefreshCallback = await finishXLogin(missingRefresh.authorizeURL, missingRefresh.cookie);
    expect(missingRefreshCallback.headers.get("location")).toContain("x_error=1");
    omitRefreshToken = false;
    omitPublishingScope = true;
    profileId = "4000000000000000004";
    const missingScope = await startXLogin();
    const missingScopeCallback = await finishXLogin(missingScope.authorizeURL, missingScope.cookie);
    expect(missingScopeCallback.headers.get("location")).toContain("x_error=1");
    omitPublishingScope = false;
    const rejectedGrantDb = new Database(databasePath);
    try {
      expect(rejectedGrantDb.query("SELECT count(*) AS count FROM account WHERE providerId='twitter' AND accountId IN (?,?)").get("4000000000000000003", "4000000000000000004")).toEqual({ count: 0 });
      expect(rejectedGrantDb.query("SELECT count(*) AS count FROM x_oauth_accounts WHERE x_user_id IN (?,?)").get("4000000000000000003", "4000000000000000004")).toEqual({ count: 0 });
    } finally { rejectedGrantDb.close(); }

    profileId = "5000000000000000005";
    invalidUsername = true;
    const failedProvision = await startXLogin();
    const failedProvisionCallback = await finishXLogin(failedProvision.authorizeURL, failedProvision.cookie);
    expect(failedProvisionCallback.status).toBe(302);
    expect(failedProvisionCallback.headers.get("location")).toContain("x_error=1");
    const failedCookies = (failedProvisionCallback.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
    expect(failedCookies.some((cookie) => cookie.includes("better-auth.session_token"))).toBe(false);
    invalidUsername = false;
    expect(avatarFetches).toBe(3);
  });

  test("X identity linking requires a current session", async () => {
        const anonymous = await runtime.handler(authRequest("/link-social", { provider: "twitter", callbackURL: "/settings/security" }));
    expect(anonymous.status).toBe(401);
    profileHasEmail = true;
  });
});
}
