import { expect, test } from "bun:test";

test("𝕏 login uses read-only scopes, stable identity and refreshed handle without storing tokens", () => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
    import { mock } from "bun:test";
    import assert from "node:assert/strict";
    import { APIError } from "better-auth";
    import { PgDialect } from "drizzle-orm/pg-core/dialect";
    const dialect = new PgDialect();
    let options;
    let handle = "FirstHandle";
    let name = "Display Name";
    let invalidProfile = false;
    let identityOwner = null;
    let accountId = "123";
    const queries = [];
    const db = { transaction: async (fn) => fn(db), execute: async (query) => {
      const compiled = dialect.sqlToQuery(query);
      queries.push(compiled);
      if (compiled.sql.includes("SELECT owner_user_id FROM ispatla_app.user_profile_x_identity")) return { rows: identityOwner ? [{ owner_user_id: identityOwner }] : [], rowCount: 1 };
      if (compiled.sql.includes("SELECT x_user_id FROM ispatla_app.user_profile_x_identity")) return { rows: [{ x_user_id: "123" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    } };
    mock.module("./src/server/postgres.ts", () => ({ getPostgresDb: () => db }));
    mock.module("better-auth", () => ({ APIError, betterAuth: (config) => {
      options = config;
      return { handler: async () => {
        const profile = await config.socialProviders.twitter.getUserInfo({ accessToken: "secret-access-token" });
        if (!profile) return new Response(null, { status: 400 });
        assert.equal(profile.data.data.id, "123");
        assert.equal(profile.user.email, "x-123@users.ispatla.invalid");
        assert.equal(profile.user.emailVerified, false);
        const user = await config.databaseHooks.user.create.before({ name: profile.user.name, email: profile.user.email });
        assert.equal(user.data.name, name);
        const account = { accountId, providerId: "twitter", userId: "owner", accessToken: "secret-access-token" };
        const stripped = await config.databaseHooks.account.create.before(account);
        assert.equal(stripped.data.accessToken, null);
        assert.equal(stripped.data.refreshToken, null);
        await config.databaseHooks.account.create.after(stripped.data);
        return new Response(null, { status: 200 });
      } };
    } }));
    globalThis.fetch = async (url, init) => {
      assert.equal(new URL(url).origin, "https://api.x.com");
      assert.equal(new URL(url).pathname, "/2/users/me");
      assert.equal(init.headers.authorization, "Bearer secret-access-token");
      assert.equal(init.redirect, "error");
      return Response.json({ data: { id: invalidProfile ? "untrusted-id" : "123", name, username: handle, protected: false } });
    };
    const { createAuthRuntime, isXLoginEnabled } = await import("./src/server/auth.ts");
    const env = { NODE_ENV: "test", DATABASE_URL: "postgresql://test.invalid/db", BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters", BETTER_AUTH_URL: "http://localhost:3000" };
    assert.equal(isXLoginEnabled({}), false);
    assert.equal(isXLoginEnabled({ X_OAUTH_CLIENT_ID: "  ", X_OAUTH_CLIENT_SECRET: "secret" }), false);
    assert.equal(isXLoginEnabled({ X_OAUTH_CLIENT_ID: "client", X_OAUTH_CLIENT_SECRET: "secret", ISPATLA_DEMO: "1" }), false);
    assert.equal(isXLoginEnabled({ X_OAUTH_CLIENT_ID: "client", X_OAUTH_CLIENT_SECRET: "secret" }), true);
    await createAuthRuntime({ env });
    assert.deepEqual(options.socialProviders, {});
    const runtime = await createAuthRuntime({ env: { ...env, X_OAUTH_CLIENT_ID: "client", X_OAUTH_CLIENT_SECRET: "secret" } });
    assert.deepEqual(options.socialProviders.twitter.scope, ["tweet.read", "users.read"]);
    assert.equal(options.socialProviders.twitter.disableDefaultScope, true);
    for (const next of ["FirstHandle", "ChangedHandle"]) {
      handle = next;
      assert.equal((await runtime.handler(new Request("http://localhost:3000/api/auth/callback/twitter"))).status, 200);
    }
    const profiles = queries.filter((q) => q.sql.startsWith("UPDATE ispatla_app.user_profiles"));
    assert.equal(profiles.length, 2);
    assert.equal(profiles[0].params[0], "firsthandle");
    assert.equal(profiles[1].params[0], "changedhandle");
    assert.ok(profiles.every((q) => q.sql.includes("ELSE visibility END")));
    assert.ok(!queries.some((q) => q.sql.includes("x_oauth_credentials")));
    assert.ok(!queries.some((q) => q.params.includes("secret-access-token")));
    identityOwner = "another-owner";
    await assert.rejects(runtime.handler(new Request("http://localhost:3000/api/auth/callback/twitter")), /account connection could not be completed/);
    identityOwner = null;
    accountId = "456";
    await assert.rejects(runtime.handler(new Request("http://localhost:3000/api/auth/callback/twitter")), /grant did not match/);
    accountId = "123";
    invalidProfile = true;
    assert.equal((await runtime.handler(new Request("http://localhost:3000/api/auth/callback/twitter"))).status, 400);
  `], cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
}, 30_000);
