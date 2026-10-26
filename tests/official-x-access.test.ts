import { expect, test } from "bun:test";
import { OfficialXClient } from "../src/server/official-x";
import { startPostgresXOAuth, completePostgresXOAuth } from "../src/server/postgres-x-oauth";
import { refreshXToken } from "../src/server/x-oauth";

test("deployment flags cannot enable official data, publishing, OAuth authorization, or refresh", async () => {
  let providerCalls = 0;
  let officialCalls = 0;
  const previous = process.env.ISPATLA_PRIME_ENABLED;
  process.env.ISPATLA_PRIME_ENABLED = "1";
  const env = {
    NODE_ENV: "test",
    ISPATLA_PRIME_ENABLED: "1",
    X_OAUTH_CLIENT_ID: "client",
    X_OAUTH_CLIENT_SECRET: "secret",
    X_OAUTH_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback",
  };
  try {
    const client = new OfficialXClient(async () => { officialCalls++; return Response.json({ data: { id: "1" } }); });
    await expect(client.getOwnProfile({ accessToken: "token", xUserId: "1" })).rejects.toMatchObject({ code: "policy_blocked" });
    await expect(client.createPost({ accessToken: "token", xUserId: "1" }, { text: "hello" })).rejects.toMatchObject({ code: "policy_blocked" });
    await expect(startPostgresXOAuth({ ownerUserId: "owner", sessionId: "session", env }))
      .rejects.toThrow("unavailable until Prime entitlements and budget enforcement are implemented");
    await expect(completePostgresXOAuth({
      request: new Request("http://localhost:3000/api/x/oauth/callback?state=state&code=code"),
      ownerUserId: "owner",
      sessionId: "session",
      env,
      fetcher: (async () => { providerCalls++; return Response.json({}); }) as unknown as typeof fetch,
    })).rejects.toThrow("unavailable until Prime entitlements and budget enforcement are implemented");
    await expect(refreshXToken({
      accountId: 1, ownerUserId: "owner", env,
      fetcher: (async () => { providerCalls++; return Response.json({}); }) as unknown as typeof fetch,
    }, async () => undefined)).rejects.toThrow("unavailable until Prime entitlements and budget enforcement are implemented");
    expect(officialCalls).toBe(0);
    expect(providerCalls).toBe(0);
  } finally {
    if (previous === undefined) delete process.env.ISPATLA_PRIME_ENABLED;
    else process.env.ISPATLA_PRIME_ENABLED = previous;
  }
});
