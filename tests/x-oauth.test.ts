import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.ISPATLA_X_OAUTH_TEST_CHILD !== "1") {
  const root = mkdtempSync(join(tmpdir(), "ispatla-x-oauth-run-"));
  const result = Bun.spawnSync(["bun", "test", "tests/x-oauth.test.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISPATLA_X_OAUTH_TEST_CHILD: "1", ISPATLA_DB: join(root, "isolated.sqlite3"),
      ISPATLA_SECRET_KEY: "isolated-test-vault-key", ISPATLA_TOKEN_KEY_CURRENT: "old-token-key" },
  });
  const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
  rmSync(root, { recursive: true, force: true });
  test("X OAuth PKCE and ownership cases run against an isolated SQLite database", () => {
    expect(result.exitCode, output).toBe(0);
    expect(output).toContain("9 pass");
    expect(output).toContain("0 fail");
  });
} else {
const directory = mkdtempSync(join(tmpdir(), "ispatla-x-oauth-"));
const previous = { db: process.env.ISPATLA_DB, vault: process.env.ISPATLA_SECRET_KEY, token: process.env.ISPATLA_TOKEN_KEY_CURRENT, previousToken: process.env.ISPATLA_TOKEN_KEY_PREVIOUS_current };
process.env.ISPATLA_DB = join(directory, "app.sqlite3");
process.env.ISPATLA_SECRET_KEY = "isolated-test-vault-key";
process.env.ISPATLA_TOKEN_KEY_CURRENT = "old-token-key";
const oauth = await import("../src/server/x-oauth");
const store = await import("../src/server/x-oauth-store");
const database = await import("../src/server/db");
const policy = await import("../src/server/x-policy");
afterAll(() => {
  if (previous.db === undefined) delete process.env.ISPATLA_DB; else process.env.ISPATLA_DB = previous.db;
  if (previous.vault === undefined) delete process.env.ISPATLA_SECRET_KEY; else process.env.ISPATLA_SECRET_KEY = previous.vault;
  if (previous.token === undefined) delete process.env.ISPATLA_TOKEN_KEY_CURRENT; else process.env.ISPATLA_TOKEN_KEY_CURRENT = previous.token;
  if (previous.previousToken === undefined) delete process.env.ISPATLA_TOKEN_KEY_PREVIOUS_current; else process.env.ISPATLA_TOKEN_KEY_PREVIOUS_current = previous.previousToken;
  rmSync(directory, { recursive: true, force: true });
});
const env = { NODE_ENV: "test", X_OAUTH_CLIENT_ID: "fixture-client", X_OAUTH_CLIENT_SECRET: "fixture-secret", X_OAUTH_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback" };
const scopes = [...oauth.X_OAUTH_SCOPES];

describe("X OAuth PKCE and credential lifecycle", () => {
  test("binds one-time PKCE state to the app user/session and encrypts renewable tokens", async () => {
    expect(database.ensureDatabase()).toBe(true);
    const started = await oauth.startXOAuth({ ownerUserId: "user-a", sessionId: "session-a", returnTo: "/tr/onboarding?step=x", env });
    const authorize = new URL(started.authorizationUrl);
    expect(authorize.origin + authorize.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(authorize.searchParams.get("scope")?.split(" ")).toEqual(scopes);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    process.env.ISPATLA_TOKEN_KEY_CURRENT = "new-token-key";
    process.env.ISPATLA_TOKEN_KEY_PREVIOUS_current = "old-token-key";
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url);
      if (url.endsWith("/2/oauth2/token")) return Response.json({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 7200, scope: scopes.join(" ") });
      if (url.includes("/2/users/me")) return Response.json({ data: { id: "123456", username: "fixture_user", name: "Fixture User", description: "Manual X bio", profile_image_url: "https://pbs.twimg.com/profile_images/123456/avatar.png", protected: false } });
      if (url.startsWith("https://pbs.twimg.com/")) return new Response(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), { headers: { "content-type": "image/png" } });
      throw new Error("unexpected fixture request");
    }) as unknown as typeof fetch;
    const callback = new Request("http://localhost:3000/api/x/oauth/callback?code=fixture-code&state=" + encodeURIComponent(authorize.searchParams.get("state")!));
    await expect(oauth.completeXOAuth({ request: callback, ownerUserId: "user-a", sessionId: "other-session", env, fetcher })).rejects.toThrow("expired or already used");
    expect(calls).toHaveLength(0);
    const connected = await oauth.completeXOAuth({ request: callback, ownerUserId: "user-a", sessionId: "session-a", env, fetcher });
    expect(connected).toMatchObject({ handle: "fixture_user", returnTo: "/tr/onboarding?step=x" });
    expect(calls).toEqual(["https://api.x.com/2/oauth2/token", "https://api.x.com/2/users/me?user.fields=name,username,description,profile_image_url,protected", "https://pbs.twimg.com/profile_images/123456/avatar.png"]);
    const { runAsOwner } = await import("../src/server/owner-context");
    expect(runAsOwner("user-a", () => database.getOwnUserProfile())).toMatchObject({ xHandle: "fixture_user", displayName: "Fixture User", bio: "Manual X bio", visibility: "public", avatarUrl: "/api/profile/avatar/123456" });
    const secondIdentity = store.connectXAccount({ ownerUserId: "user-a", xUserId: "654321", handle: "second2", displayName: "Second", accessToken: "second-access", refreshToken: "second-refresh", expiresAt: 9999999999, scopes, now: 149 });
    const { cacheSelectedProfileAvatar } = await import("../src/server/profile-avatar");
    let secondaryImageFetched = false;
    expect(await cacheSelectedProfileAvatar({ ownerUserId: "user-a", xUserId: "654321", handle: "second2", displayName: "Second", bio: "", avatarUrl: "https://pbs.twimg.com/profile_images/654321/avatar.png", fetcher: (async () => { secondaryImageFetched = true; return Response.error(); }) as unknown as typeof fetch })).toBeNull();
    expect(secondaryImageFetched).toBe(false);
    expect(secondIdentity.handle).toBe("second2");
    await expect(oauth.completeXOAuth({ request: callback, ownerUserId: "user-a", sessionId: "session-a", env, fetcher })).rejects.toThrow("expired or already used");
    expect(store.getXCredential(connected.accountId, "user-a")).toMatchObject({ accessToken: "access-secret", refreshToken: "refresh-secret" });
    const raw = await Bun.file(process.env.ISPATLA_DB!).text();
    expect(raw).not.toContain("access-secret");
    expect(raw).not.toContain("refresh-secret");
    expect(oauth.getXAccountAuthState(connected.accountId, "user-a")?.consents.find((consent) => consent.action === "post")).toMatchObject({ mode: "observe", policyVersion: policy.X_POLICY_VERSION, copyVersion: policy.X_CONSENT_COPY_VERSION });
  });

  test("enforces account identity ownership, scope set, and internal return allowlist", async () => {
    const second = store.connectXAccount({ ownerUserId: "user-a", xUserId: "654322", handle: "second_fixture", displayName: "Second", accessToken: "second-access", refreshToken: "second-refresh", expiresAt: 9999999999, scopes, now: 150 });
    expect(second.accountId).not.toBe(1);
    expect(oauth.getXAccountAuthState(second.accountId, "user-a")).toMatchObject({ connected: true, handle: "second_fixture" });
    const { runAsOwner } = await import("../src/server/owner-context");
    const manual = runAsOwner("manual-owner", () => database.saveAccount({accountKey:"editorial",handle:"editorial",displayName:"Editorial",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:7,capabilities:[],styleProfile:{purpose:"preserved"},now:150}));
    const linked = store.connectXAccount({ownerUserId:"manual-owner",xUserId:"998877",handle:"editorial",accessToken:"a",refreshToken:"r",expiresAt:9999999999,scopes,now:151});
    expect(linked.accountId).toBe(manual.id);
    expect(runAsOwner("manual-owner",()=>database.getAccounts()[0])).toMatchObject({dailyLimit:7,accountKey:"editorial",styleProfile:{purpose:"preserved"}});
    expect(() => store.connectXAccount({ ownerUserId: "user-b", xUserId: "123456", handle: "fixture_user", accessToken: "a", refreshToken: "r", expiresAt: 9999999999, scopes, now: 100 })).toThrow("another user");
    expect(() => store.connectXAccount({ ownerUserId: "user-b", xUserId: "987654", handle: "other_user", accessToken: "a", refreshToken: "r", expiresAt: 9999999999, scopes: ["users.read"], now: 100 })).toThrow("permissions are missing");
    await expect(oauth.startXOAuth({ ownerUserId: "user-a", sessionId: "session-a", returnTo: "https://evil.test", env })).rejects.toThrow("return path");
  });

  test("backfills an existing connected owner's unbound profile from its verified X identity", async () => {
    const { Database } = await import("bun:sqlite");
    const { OfficialXClient } = await import("../src/server/official-x");
    const { loadOwnUserProfileFromX } = await import("../src/server/x-profile-sync");
    const { runAsOwner } = await import("../src/server/owner-context");
    const now = Math.floor(Date.now() / 1000);
    store.connectXAccount({ ownerUserId: "backfill-owner", xUserId: "777000", handle: "old_handle", accessToken: "backfill-access", refreshToken: "backfill-refresh", expiresAt: now + 3600, scopes, now });
    const db = new Database(process.env.ISPATLA_DB!);
    try {
      db.query("DELETE FROM user_profile_x_identity WHERE owner_user_id='backfill-owner'").run();
      db.query("UPDATE user_profiles SET x_handle=NULL,display_name='',bio='',avatar_url=NULL,visibility='private',onboarding_completed=1 WHERE owner_user_id='backfill-owner'").run();
    } finally { db.close(); }

    const profileMethod = OfficialXClient.prototype.getOwnProfile;
    const originalFetch = globalThis.fetch;
    const savedEnv = { clientId: process.env.X_OAUTH_CLIENT_ID, redirect: process.env.X_OAUTH_REDIRECT_URI };
    let profileReads = 0;
    let profileProtected = true;
    let imageFetches = 0;
    OfficialXClient.prototype.getOwnProfile = async (credential) => {
      profileReads++;
      return { id: credential.xUserId === "777001" ? "999999" : credential.xUserId, username: "Verified_User", name: "Verified name", description: "Verified biography", protected: profileProtected, profile_image_url: "https://pbs.twimg.com/profile_images/777000/avatar.png" };
    };
    process.env.X_OAUTH_CLIENT_ID = "fixture-client";
    process.env.X_OAUTH_REDIRECT_URI = "http://localhost:3000/api/x/oauth/callback";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).startsWith("https://pbs.twimg.com/")) {
        imageFetches++;
        return new Response(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), { headers: { "content-type": "image/png" } });
      }
      throw new Error("unexpected backfill request");
    }) as unknown as typeof fetch;
    try {
      const loaded = await runAsOwner("backfill-owner", () => loadOwnUserProfileFromX());
      expect(loaded).toMatchObject({ xHandle: "Verified_User", displayName: "Verified name", bio: "Verified biography", avatarUrl: "/api/profile/avatar/777000", visibility: "private", onboardingCompleted: true });
      profileProtected = false;
      expect(await runAsOwner("backfill-owner", () => loadOwnUserProfileFromX())).toMatchObject({ xHandle: "Verified_User", visibility: "public" });
      expect(profileReads).toBe(2);
      expect(imageFetches).toBe(2);

      store.connectXAccount({ ownerUserId: "backfill-mismatch", xUserId: "777001", handle: "mismatch", accessToken: "mismatch-access", refreshToken: "mismatch-refresh", expiresAt: now + 3600, scopes, now });
      const mismatchDb = new Database(process.env.ISPATLA_DB!);
      try {
        mismatchDb.query("DELETE FROM user_profile_x_identity WHERE owner_user_id='backfill-mismatch'").run();
        mismatchDb.query("UPDATE user_profiles SET x_handle=NULL,display_name='',bio='',avatar_url=NULL WHERE owner_user_id='backfill-mismatch'").run();
      } finally { mismatchDb.close(); }
      const mismatch = await runAsOwner("backfill-mismatch", () => loadOwnUserProfileFromX());
      expect(mismatch.xHandle).toBeNull();
      expect(profileReads).toBe(3);
      expect(imageFetches).toBe(2);
    } finally {
      OfficialXClient.prototype.getOwnProfile = profileMethod;
      globalThis.fetch = originalFetch;
      if (savedEnv.clientId === undefined) delete process.env.X_OAUTH_CLIENT_ID; else process.env.X_OAUTH_CLIENT_ID = savedEnv.clientId;
      if (savedEnv.redirect === undefined) delete process.env.X_OAUTH_REDIRECT_URI; else process.env.X_OAUTH_REDIRECT_URI = savedEnv.redirect;
    }
  });

  test("rolls back the app account if mapping insertion fails", () => {
    expect(() => store.connectXAccount({ ownerUserId: "user-z", xUserId: "888888", handle: "fixture_user", accessToken: "a", refreshToken: "r", expiresAt: 9999999999, scopes }))
      .toThrow();
    const db = store.xOAuthStorageInternals.openDb(process.env.ISPATLA_DB);
    try {
      expect(db.prepare("SELECT count(*) AS count FROM accounts WHERE account_key='x:888888'").get()?.count).toBe(0);
      expect(db.prepare("SELECT count(*) AS count FROM x_oauth_accounts WHERE x_user_id='888888'").get()?.count).toBe(0);
    } finally { db.close(); }
  });

  test("serializes competing owners trying to link the same X identity", async () => {
    const candidates = await Promise.allSettled([
      Promise.resolve().then(() => store.connectXAccount({ ownerUserId: "race-a", xUserId: "777777", handle: "race_a", accessToken: "a", refreshToken: "r", expiresAt: 9999999999, scopes })),
      Promise.resolve().then(() => store.connectXAccount({ ownerUserId: "race-b", xUserId: "777777", handle: "race_b", accessToken: "b", refreshToken: "s", expiresAt: 9999999999, scopes })),
    ]);
    expect(candidates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(candidates.filter((result) => result.status === "rejected")).toHaveLength(1);
    const db = store.xOAuthStorageInternals.openDb(process.env.ISPATLA_DB);
    try {
      expect(db.prepare("SELECT count(*) AS count FROM accounts WHERE account_key='x:777777'").get()?.count).toBe(1);
      expect(db.prepare("SELECT count(*) AS count FROM x_oauth_accounts WHERE x_user_id='777777'").get()?.count).toBe(1);
    } finally { db.close(); }
  });

  test("single-flights 20 simultaneous refreshes and refuses to restore a revoked grant", async () => {
    const now = 2_000_000_000;
    const account = store.connectXAccount({ ownerUserId: "user-c", xUserId: "234567", handle: "refresh_user", displayName: "Refresh", accessToken: "old-access", refreshToken: "old-refresh", expiresAt: now + 1, scopes, now });
    let calls = 0;
    const refresh = async (refreshToken: string) => {
      calls++;
      expect(refreshToken).toBe("old-refresh");
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { accessToken: "new-access", refreshToken: "rotated-refresh", expiresAt: now + 7200, scopes };
    };
    const all = await Promise.all(Array.from({ length: 20 }, () => store.withXTokenRefresh({ accountId: account.accountId, ownerUserId: "user-c", refresh, now: () => now, waitMs: 5 }, async (credential) => credential.accessToken)));
    expect(calls).toBe(1);
    expect(all.every((value) => value === "new-access")).toBe(true);
    expect(store.getXCredential(account.accountId, "user-c")).toMatchObject({ accessToken: "new-access", refreshToken: "rotated-refresh", version: 2 });

    const revoked = store.connectXAccount({ ownerUserId: "user-d", xUserId: "345678", handle: "revoked_user", accessToken: "old-access-2", refreshToken: "old-refresh-2", expiresAt: now + 1, scopes, now });
    let release: (() => void) | undefined;
    const pending = store.withXTokenRefresh({ accountId: revoked.accountId, ownerUserId: "user-d", now: () => now, refresh: async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { accessToken: "bad", refreshToken: "bad", expiresAt: now + 7200, scopes };
    } }, async () => "bad");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(store.disconnectXAccount({ accountId: revoked.accountId, ownerUserId: "user-d", now })).toBe(true);
    release?.();
    await expect(pending).rejects.toThrow("disconnected");
    expect(store.getXCredential(revoked.accountId, "user-d")).toMatchObject({ revokedAt: now, authState: "revoked", accessToken: "" });
  }, 20_000);

  test("refresh preserves omitted scopes and invalid_grant requires reauthorization", async () => {
    const now = 2_100_000_000;
    const account = store.connectXAccount({ ownerUserId: "user-e", xUserId: "456789", handle: "scope_user", accessToken: "old", refreshToken: "refresh", expiresAt: now + 1, scopes, now });
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ access_token: "renewed", refresh_token: "rotated", expires_in: 3600 });
    }) as unknown as typeof fetch;
    await oauth.refreshXToken({ accountId: account.accountId, ownerUserId: "user-e", now: () => now, env, fetcher }, async (credential) => {
      expect(credential.scopes).toEqual(scopes);
    });
    expect(store.getXCredential(account.accountId, "user-e")).toMatchObject({ accessToken: "renewed", scopes });
    const invalid = store.connectXAccount({ ownerUserId: "user-f", xUserId: "567890", handle: "invalid_grant", accessToken: "old", refreshToken: "invalid", expiresAt: now + 1, scopes, now });
    await expect(store.withXTokenRefresh({ accountId: invalid.accountId, ownerUserId: "user-f", now: () => now, refresh: async () => { throw new Error("invalid_grant"); } }, async () => "never")).rejects.toThrow("invalid_grant");
    expect(oauth.getXAccountAuthState(invalid.accountId, "user-f")).toMatchObject({ authState: "reauthorization_required", lastAuthError: "reauthorization_required" });
    await expect(store.withXTokenRefresh({ accountId: invalid.accountId, ownerUserId: "user-f", now: () => now, refresh: async () => { throw new Error("must not retry"); } }, async () => "never")).rejects.toThrow("reauthorization");
  });

  test("local disconnect remains enforced when X token revocation fails", async () => {
    const account = store.connectXAccount({ ownerUserId: "user-g", xUserId: "678901", handle: "remote_revoke", accessToken: "access", refreshToken: "refresh", expiresAt: 9999999999, scopes });
    let attempted = false;
    const fetcher = (async () => { attempted = true; return new Response(null, { status: 503 }); }) as unknown as typeof fetch;
    const result = await oauth.revokeXAccount({ accountId: account.accountId, ownerUserId: "user-g", env, fetcher });
    expect(result).toEqual({ disconnected: true, providerRevoked: false });
    expect(attempted).toBe(true);
    expect(store.getXCredential(account.accountId, "user-g")?.accessToken).toBe("");
  });

  test("automation consent uses independent versions and cannot silently survive disconnect", () => {
    const account = store.getXAccountAuthState(1, "user-a");
    expect(account).not.toBeNull();
    expect(oauth.setAutomationConsent({ accountId: 1, ownerUserId: "user-a", action: "post", mode: "auto", expectedVersion: 1, policyVersion: policy.X_POLICY_VERSION, copyVersion: policy.X_CONSENT_COPY_VERSION, dailyLimit: 3, cadenceSeconds: 3600, now: 200 })).toMatchObject({ action: "post", mode: "auto", version: 2, policyVersion: policy.X_POLICY_VERSION, copyVersion: policy.X_CONSENT_COPY_VERSION, dailyLimit: 3, cadenceSeconds: 3600 });
    expect(() => oauth.setAutomationConsent({ accountId: 1, ownerUserId: "user-a", action: "post", mode: "auto", expectedVersion: 1, policyVersion: policy.X_POLICY_VERSION, copyVersion: policy.X_CONSENT_COPY_VERSION, dailyLimit: 3, cadenceSeconds: 3600, now: 201 })).toThrow("version conflict");
    expect(oauth.setAutomationConsent({ accountId: 1, ownerUserId: "user-a", action: "post", mode: "off", expectedVersion: 2, policyVersion: policy.X_POLICY_VERSION, copyVersion: policy.X_CONSENT_COPY_VERSION, dailyLimit: 0, cadenceSeconds: 0, now: 201 })).toMatchObject({ mode: "off", version: 3, revokedAt: 201 });
    expect(oauth.getXAccountAuthState(1, "user-a")?.consents.find((consent) => consent.action === "repost")).toMatchObject({ mode: "observe", version: 1, revokedAt: null });
    expect(oauth.disconnectXAccount({ accountId: 1, ownerUserId: "user-a", now: 202 })).toBe(true);
    expect(oauth.getXAccountAuthState(1, "user-a")?.consents.find((consent) => consent.action === "post")).toMatchObject({ mode: "off", version: 4, revokedAt: 201 });
  });
});
}
