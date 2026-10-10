import { expect, test } from "bun:test";

test("X OAuth start, account provisioning and refresh bind scopes as PostgreSQL arrays", () => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
    import { mock } from "bun:test";
    import assert from "node:assert/strict";
    import { PgDialect } from "drizzle-orm/pg-core/dialect";
    const dialect = new PgDialect();
    const scopeQueries = [];
    let credential;
    const db = {
      transaction: async (work) => work(db),
      execute: async (query) => {
        const compiled = dialect.sqlToQuery(query);
        const text = compiled.sql;
        if (text.includes("::text[]")) {
          const match = /\\$(\\d+)::text\\[\\]/.exec(text);
          assert.ok(match, "scopes must use a single bound parameter: " + text);
          assert.deepEqual(compiled.params[Number(match[1]) - 1], scopes);
          scopeQueries.push(text);
        }
        if (text.includes("SELECT a.x_user_id,a.handle,a.display_name,a.auth_state,c.encrypted_access_token")) return { rows: [credential], rowCount: 1 };
        if (text.includes("SELECT count(*)")) return { rows: [{ count: "0" }], rowCount: 1 };
        if (text.startsWith("INSERT INTO ispatla_app.accounts(")) return { rows: [{ id: 1 }], rowCount: 1 };
        if (text.startsWith("SELECT x_user_id FROM ispatla_app.user_profile_x_identity")) return { rows: [{ x_user_id: "123" }], rowCount: 1 };
        if (text.startsWith("UPDATE ispatla_app.x_oauth_credentials SET encrypted_access_token")) {
          credential.encrypted_access_token = compiled.params[0];
          credential.encrypted_refresh_token = compiled.params[1];
          credential.access_expires_at = 999999;
        }
        return { rows: [], rowCount: 1 };
      },
    };
    mock.module("@/server/postgres", () => ({ getPostgresDb: () => db }));
    const oauth = await import("./src/server/postgres-x-oauth.ts");
    const scopes = [...oauth.POSTGRES_X_OAUTH_SCOPES];
    const env = { NODE_ENV: "test", X_OAUTH_CLIENT_ID: "test", X_OAUTH_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback", ISPATLA_TOKEN_KEY_CURRENT: "test-key" };
    process.env.ISPATLA_TOKEN_KEY_CURRENT = env.ISPATLA_TOKEN_KEY_CURRENT;
    await oauth.startPostgresXOAuth({ ownerUserId: "owner", sessionId: "session", env });
    await oauth.connectPostgresXAccount({ ownerUserId: "owner", xUserId: "123", handle: "tester", accessToken: "access", refreshToken: "refresh", expiresAt: 100, scopes: [...scopes, scopes[0]], env });
    credential = { x_user_id: "123", handle: "tester", display_name: "Tester", auth_state: "connected", encrypted_access_token: oauth.postgresXOAuthInternals.seal("access", env).value, encrypted_refresh_token: oauth.postgresXOAuthInternals.seal("refresh", env).value, access_expires_at: 100, scopes, token_version: 1, revoked_at: null };
    await oauth.withPostgresXTokenRefresh({ accountId: 1, ownerUserId: "owner", now: () => 200, refresh: async () => ({ accessToken: "new-access", refreshToken: "new-refresh", expiresAt: 999999, scopes: [...scopes, scopes[0]] }) }, async (grant) => assert.equal(grant.accessToken, "new-access"));
    assert.equal(scopeQueries.length, 3);
  `], cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
}, 30_000);
