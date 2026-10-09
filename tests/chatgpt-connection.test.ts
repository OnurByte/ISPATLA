import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("ChatGPT plan OAuth validates loopback, PKCE, expiry, identity, and owner vault boundaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "ispatla-chatgpt-connection-"));
  try {
    const script = `
      import { strict as assert } from "node:assert";
      import { createHash } from "node:crypto";
      import { createLocalJWKSet, generateKeyPair, SignJWT } from "jose";
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { beginChatGPTConnection, chatGPTAuthorizationUrl, disconnectChatGPT, getChatGPTAccessToken, getChatGPTConnectionStatus, getChatGPTCredentialFingerprint, getChatGPTPlanContext, isChatGPTFlowExpired, isLoopbackHost } from "./src/server/chatgpt-connection.ts";
      import { saveSecret, readSecret } from "./src/server/vault.ts";
      import { getSecretCiphertext } from "./src/server/db.ts";
      assert.equal(isLoopbackHost("localhost"), true);
      assert.equal(isLoopbackHost("127.0.0.2"), true);
      assert.equal(isLoopbackHost("::1"), true);
      assert.equal(isLoopbackHost("example.com"), false);
      assert.equal(isLoopbackHost("127.0.0.1.example.com"), false);
      assert.equal(isChatGPTFlowExpired(100, 100), true);
      assert.equal(isChatGPTFlowExpired(Number.NaN, 0), true);
      assert.equal(isChatGPTFlowExpired(101, 100), false);

      const verifier = "a-test-verifier-with-enough-entropy-for-pkce";
      const url = new URL(chatGPTAuthorizationUrl({ clientId: "dynamic_agent_client", callbackUri: "http://127.0.0.1:4455/auth/callback", hostId: "urn:uuid:stable", state: "state-value", nonce: "nonce-value", verifier }));
      assert.equal(url.origin + url.pathname, "https://auth.openai.com/api/accounts/authorize");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
      assert.equal(url.searchParams.get("ext_agent_host_id"), "urn:uuid:stable");
      assert.equal(url.searchParams.get("agent_name_hint"), "Ispatla");
      assert.equal(url.searchParams.get("resource"), "https://api.openai.com/v1");
      assert.equal(url.searchParams.get("scope")?.split(" ").includes("chatgpt.tokens.use.direct"), true);
      assert.equal(url.searchParams.has("client_secret"), false);
      await assert.rejects(() => runAsOwner("owner-a", () => beginChatGPTConnection("example.com")), /local development host/);
      process.env.NODE_ENV = "production";
      await assert.rejects(() => runAsOwner("owner-a", () => beginChatGPTConnection("localhost")), /local development host/);
      process.env.NODE_ENV = "test";
      assert.throws(() => getChatGPTConnectionStatus(), /authenticated profile owner required/);
      assert.deepEqual(runAsOwner("owner-a", () => getChatGPTConnectionStatus()), { connected: false, email: null, expiresAt: null, scopes: [] });
      assert.deepEqual(runAsOwner("owner-b", () => getChatGPTConnectionStatus()), { connected: false, email: null, expiresAt: null, scopes: [] });
      await assert.rejects(() => runAsOwner("owner-a", () => getChatGPTPlanContext()), /not connected/);

      const scopes = ["openid", "profile", "email", "offline_access", "resource.invoke", "chatgpt.tokens.use.direct"];
      runAsOwner("owner-a", () => saveSecret("chatgpt_plan_usage", "ChatGPT plan usage", JSON.stringify({ clientId: "issued-client-id-123", email: "writer@example.test", subject: "chatgpt-subject", idToken: "private-id-token", accessToken: "expired-access-token", refreshToken: "private-refresh-token", expiresAt: Date.now() - 1, scopes })));
      assert.equal(runAsOwner("owner-a", () => getSecretCiphertext("chatgpt_plan_usage")?.ciphertext.includes("private-refresh-token")), false);
      assert.equal(runAsOwner("owner-b", () => readSecret("chatgpt_plan_usage")), null);
      const originalFetch = globalThis.fetch;
      let refreshCalls = 0;
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(_input).includes("oauth/token")) {
          refreshCalls++;
          assert.equal(new URLSearchParams(String(init?.body)).get("refresh_token"), "private-refresh-token");
          await new Promise((resolve) => setTimeout(resolve, 20));
          return Response.json({ access_token: "rotated-access-token", refresh_token: "rotated-refresh-token", expires_in: 3600, scope: scopes.join(" ") });
        }
        if (String(_input).includes("openid-configuration")) return Response.json({ revocation_endpoint: "https://auth.openai.com/api/accounts/oauth/revoke" });
        if (String(_input).includes("oauth/revoke")) {
          assert.equal(new URLSearchParams(String(init?.body)).get("token"), "rotated-refresh-token");
          return new Response(null, { status: 200 });
        }
        throw new Error("unexpected network request");
      }) as typeof fetch;
      try {
        const [tokenOne, tokenTwo] = await runAsOwner("owner-a", () => Promise.all([getChatGPTAccessToken(), getChatGPTAccessToken()]));
        assert.equal(tokenOne, "rotated-access-token");
        assert.equal(tokenTwo, "rotated-access-token");
        assert.equal(refreshCalls, 1, "concurrent use must rotate refresh credentials once");
        const status = runAsOwner("owner-a", () => getChatGPTConnectionStatus());
        assert.equal(status.connected, true);
        assert.equal(status.email, "writer@example.test");
        assert.equal(typeof status.expiresAt, "number");
        assert.deepEqual(status.scopes, scopes);
        assert.equal(JSON.stringify(status).includes("rotated-access-token"), false);
        const fingerprint = runAsOwner("owner-a", () => getChatGPTCredentialFingerprint());
        assert.equal(typeof fingerprint, "string");
        assert.equal(runAsOwner("owner-b", () => getChatGPTConnectionStatus()).connected, false);
        assert.equal(runAsOwner("owner-b", () => getChatGPTCredentialFingerprint()), null);
        assert.equal(runAsOwner("owner-a", () => getChatGPTCredentialFingerprint()), fingerprint, "refresh rotation must not invalidate identity fingerprint");
        assert.deepEqual(await runAsOwner("owner-a", () => disconnectChatGPT()), { revoked: true });
        assert.equal(runAsOwner("owner-a", () => getChatGPTConnectionStatus()).connected, false);
        runAsOwner("owner-a", () => saveSecret("chatgpt_plan_usage", "ChatGPT plan usage", JSON.stringify({ clientId: "issued-client-id-123", email: "writer@example.test", subject: "chatgpt-subject", idToken: "private-id-token", accessToken: "private-access-token", refreshToken: "private-refresh-token", expiresAt: Date.now() + 3600_000, scopes })));
        globalThis.fetch = (async () => { throw new Error("revocation service unavailable"); }) as typeof fetch;
        assert.deepEqual(await runAsOwner("owner-a", () => disconnectChatGPT()), { revoked: false });
        assert.equal(runAsOwner("owner-a", () => getChatGPTConnectionStatus()).connected, false, "local credential must be removed even when remote revocation is unavailable");
      } finally { globalThis.fetch = originalFetch; }

      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwks = createLocalJWKSet({ keys: [await (await import("jose")).exportJWK(publicKey).then((jwk) => ({ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }))] });
      const base = { issuer: "https://auth.openai.com", audience: "issued-client-id-123", subject: "chatgpt-subject", nonce: "expected-nonce" };
      const sign = (claims: Record<string, unknown>, exp = "2h") => {
        const payload = { ...claims, nonce: typeof claims.nonce === "string" ? claims.nonce : base.nonce };
        return new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(base.issuer).setAudience(base.audience).setSubject(base.subject).setIssuedAt().setExpirationTime(exp).sign(privateKey);
      };
      const verify = async (token: string) => {
        const { verifyChatGPTIdToken } = await import("./src/server/chatgpt-connection.ts");
        return verifyChatGPTIdToken(token, { clientId: base.audience, nonce: base.nonce, jwks });
      };
      const valid = await sign({ email: "writer@example.test" });
      assert.deepEqual(await verify(valid), { subject: base.subject, email: "writer@example.test" });
      const wrongNonce = await sign({ nonce: "wrong-nonce" });
      await assert.rejects(() => verify(wrongNonce), /identity validation/);
      await assert.rejects(() => import("./src/server/chatgpt-connection.ts").then(({ verifyChatGPTIdToken }) => verifyChatGPTIdToken(valid, { clientId: "different-client-123", nonce: base.nonce, jwks })), /aud/);
      const expired = await sign({}, "-10m");
      await assert.rejects(() => verify(expired), /exp/);
      assert.deepEqual(await runAsOwner("owner-a", () => disconnectChatGPT()), { revoked: true });

      const flowA = await runAsOwner("owner-a", () => beginChatGPTConnection("localhost"));
      const flowB = await runAsOwner("owner-b", () => beginChatGPTConnection("localhost"));
      const authA = new URL(flowA.authorizationUrl);
      const authB = new URL(flowB.authorizationUrl);
      assert.equal(authA.searchParams.get("ext_agent_host_id"), authB.searchParams.get("ext_agent_host_id"), "host id must be stable across users");
      const callbackA = new URL(authA.searchParams.get("redirect_uri")!);
      const callbackB = new URL(authB.searchParams.get("redirect_uri")!);
      let finishTokenExchange!: (response: Response) => void;
      let callbackTokenCalls = 0;
      const callbackIdToken = await new SignJWT({ nonce: authA.searchParams.get("nonce") }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(base.issuer).setAudience(base.audience).setSubject(base.subject).setIssuedAt().setExpirationTime("2h").sign(privateKey);
      const beforeCallbackFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target === "https://auth.openai.com/.well-known/jwks.json") return Response.json({ keys: [{ ...await (await import("jose")).exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" }] });
        if (target.includes("openid-configuration")) return Response.json({ revocation_endpoint: "https://auth.openai.com/api/accounts/oauth/revoke" });
        if (target.includes("oauth/revoke")) return new Response(null, { status: 200 });
        if (target.includes("/oauth/token")) {
          callbackTokenCalls++;
          return await new Promise<Response>((resolve) => { finishTokenExchange = resolve; });
        }
        return beforeCallbackFetch(input, init);
      }) as typeof fetch;
      try {
        const mismatch = await beforeCallbackFetch(new URL(callbackA + "?state=" + encodeURIComponent(authB.searchParams.get("state")!) + "&code=wrong&client_id=" + base.audience));
        assert.equal(mismatch.status, 400, "listener A must reject listener B's state");
        const callbackPromise = beforeCallbackFetch(new URL(callbackA + "?state=" + encodeURIComponent(authA.searchParams.get("state")!) + "&code=code-a&client_id=" + base.audience));
        while (callbackTokenCalls === 0) await new Promise((resolve) => setTimeout(resolve, 1));
        const replay = await beforeCallbackFetch(new URL(callbackA + "?state=" + encodeURIComponent(authA.searchParams.get("state")!) + "&code=code-a&client_id=" + base.audience));
        assert.equal(replay.status, 409, "a callback replay must not exchange the authorization code twice");
        assert.equal(callbackTokenCalls, 1);
        finishTokenExchange(Response.json({ access_token: "callback-access", refresh_token: "callback-refresh", id_token: callbackIdToken, expires_in: 3600, scope: scopes.join(" ") }));
        assert.equal((await callbackPromise).status, 200);
        assert.equal(runAsOwner("owner-a", () => getChatGPTConnectionStatus()).connected, true);
        await runAsOwner("owner-b", () => disconnectChatGPT());
        await assert.rejects(() => beforeCallbackFetch(new URL(callbackB + "?state=" + encodeURIComponent(authB.searchParams.get("state")!) + "&code=code-b&client_id=" + base.audience)));
        assert.equal(callbackTokenCalls, 1, "disconnect must close the pending listener before code exchange");

        const flowC = await runAsOwner("owner-c", () => beginChatGPTConnection("localhost"));
        const authC = new URL(flowC.authorizationUrl);
        const callbackC = new URL(authC.searchParams.get("redirect_uri")!);
        const idTokenC = await new SignJWT({ nonce: authC.searchParams.get("nonce") }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(base.issuer).setAudience(base.audience).setSubject(base.subject).setIssuedAt().setExpirationTime("2h").sign(privateKey);
        const callbackWhileDisconnecting = beforeCallbackFetch(new URL(callbackC + "?state=" + encodeURIComponent(authC.searchParams.get("state")!) + "&code=code-c&client_id=" + base.audience));
        while (callbackTokenCalls < 2) await new Promise((resolve) => setTimeout(resolve, 1));
        await runAsOwner("owner-c", () => disconnectChatGPT());
        finishTokenExchange(Response.json({ access_token: "must-not-save", refresh_token: "must-not-save", id_token: idTokenC, expires_in: 3600, scope: scopes.join(" ") }));
        assert.equal((await callbackWhileDisconnecting).status, 400);
        assert.equal(runAsOwner("owner-c", () => getChatGPTConnectionStatus()).connected, false, "an in-flight callback must not recreate a disconnected connection");
      } finally { globalThis.fetch = beforeCallbackFetch; }

      runAsOwner("owner-a", () => saveSecret("chatgpt_plan_usage", "ChatGPT plan usage", JSON.stringify({ clientId: base.audience, email: "writer@example.test", subject: base.subject, idToken: "private-id-token", accessToken: "expired-access-token", refreshToken: "private-refresh-token", expiresAt: Date.now() - 1, scopes })));
      let finishRefresh!: (response: Response) => void;
      const beforeLateRefreshFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("oauth/token")) return await new Promise<Response>((resolve) => { finishRefresh = resolve; });
        if (String(input).includes("openid-configuration")) return Response.json({ revocation_endpoint: "https://auth.openai.com/api/accounts/oauth/revoke" });
        if (String(input).includes("oauth/revoke")) return new Response(null, { status: 200 });
        return beforeLateRefreshFetch(input, init);
      }) as typeof fetch;
      try {
        const lateRefresh = runAsOwner("owner-a", () => getChatGPTAccessToken());
        while (!finishRefresh) await new Promise((resolve) => setTimeout(resolve, 1));
        await runAsOwner("owner-a", () => disconnectChatGPT());
        finishRefresh(Response.json({ access_token: "must-not-return", refresh_token: "must-not-store", expires_in: 3600, scope: scopes.join(" ") }));
        await assert.rejects(() => lateRefresh, /disconnected while refreshing/);
        assert.equal(runAsOwner("owner-a", () => getChatGPTConnectionStatus()).connected, false);
      } finally { globalThis.fetch = beforeLateRefreshFetch; }
      console.log("CHATGPT_OAUTH_SECURITY_OK");
    `;
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(dir, "state.sqlite3"), ISPATLA_SECRET_KEY: "chatgpt-test-vault-key", NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toContain("CHATGPT_OAUTH_SECURITY_OK");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
