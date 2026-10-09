import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runIsolated(script: string): Record<string, unknown> {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-mcp-auth-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ISPATLA_DB: join(directory, "state.sqlite3"),
        ISPATLA_PRIVATE_BETA: "1",
        BETTER_AUTH_SECRET: "mcp-test-secret-that-is-at-least-32-characters",
        BETTER_AUTH_URL: "https://ispatla.test",
        NODE_ENV: "production",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return JSON.parse(new TextDecoder().decode(result.stdout));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("default MCP session cookie is validated on every call and owner scopes tool reads", () => {
  const result = runIsolated(`
    import assert from "node:assert/strict";
    import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
    import { createAuthRuntime } from "./src/server/auth.ts";
    import { createDraft, ensureDatabase, getDraft, saveAccount } from "./src/server/db.ts";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { createIspatlaMcpServer } from "./src/server/mcp.ts";

    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = runAsOwner("other-owner", () => saveAccount({ accountKey: "other", handle: "other", displayName: "Other", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now: 1 }));
    const draft = runAsOwner("other-owner", () => createDraft({ externalId: "", accountId: account.id, format: "post", text: "private draft text", now: 2 }));
    const authRuntime = await createAuthRuntime({ validateSignupEmail: async (email) => ({ accepted: true, normalizedEmail: email, mxStatus: "unknown" }) });
    const authRequest = (path, body, cookie) => new Request("https://ispatla.test/api/auth" + path, {
      method: body ? "POST" : "GET",
      headers: { origin: "https://ispatla.test", ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const signup = await authRuntime.handler(authRequest("/sign-up/email", { email: "mcp-user@example.test", password: "mcp-owner-password-1" }));
    assert.equal(signup.status, 200);
    const login = await authRuntime.handler(authRequest("/sign-in/email", { email: "mcp-user@example.test", password: "mcp-owner-password-1" }));
    assert.equal(login.status, 200);
    const setCookies = login.headers.getSetCookie?.() || [login.headers.get("set-cookie") || ""];
    const cookie = setCookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
    assert.ok(cookie);

    process.env.ISPATLA_MCP_USER_ID = "other-owner";
    delete process.env.ISPATLA_MCP_SESSION_COOKIE;
    const server = createIspatlaMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "mcp-owner-test", version: "0.1.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const call = async () => client.callTool({ name: "ispatla.drafts.review", arguments: { draftId: draft.id, decision: "approve", confirm: true } });
    const unauthenticated = await call();
    process.env.ISPATLA_MCP_SESSION_COOKIE = cookie;
    const crossOwner = await call();
    const crossOwnerText = crossOwner.content.map((item) => item.type === "text" ? item.text : "").join(" ");
    const signedOut = await authRuntime.handler(authRequest("/sign-out", {}, cookie));
    assert.equal(signedOut.status, 200);
    const revoked = await call();
    const original = runAsOwner("other-owner", () => getDraft(draft.id));
    await client.close();
    await server.close();
    authRuntime.close();
    console.log(JSON.stringify({
      unauthenticated: unauthenticated.isError === true,
      unauthenticatedText: unauthenticated.content.map((item) => item.type === "text" ? item.text : "").join(" "),
      crossOwner: crossOwner.isError === true,
      crossOwnerLeaksText: crossOwnerText.includes("private draft text"),
      revoked: revoked.isError === true,
      originalStatus: original?.status,
    }));
  `);
  expect(result).toEqual({
    unauthenticated: true,
    unauthenticatedText: expect.stringContaining("authentication required"),
    crossOwner: true,
    crossOwnerLeaksText: false,
    revoked: true,
    originalStatus: "draft",
  });
});
