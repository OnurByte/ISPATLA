import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { getPostgresSetting, setPostgresSetting } from "@/server/postgres-settings";
import { getPostgresPool } from "@/server/postgres";
import { runAsOwner } from "@/server/owner-context";
import { registerMcpClient, beginMcpAuthorization, approveMcpAuthorization, issueMcpTokens, resolveMcpBearer, revokeMcpToken, pkceChallenge, mcpOrigin } from "@/server/mcp-authorization";
import { preparePublication, attachPublicationReceipt, publicationStatus } from "@/server/publishing-preparation";
import { startAccountClaim, verifyAccountClaim } from "@/server/account-link";
import { getPostgresDashboardSummary } from "@/server/postgres-profile-dashboard";

// Run against a fresh migrated local database; never against application or production data.
const enabled = process.env.ISPATLA_TEST_DATABASE === "isolated" && new URL(process.env.DATABASE_URL || "http://invalid").hostname === "127.0.0.1";
const integration = test.skipIf(!enabled);
const owner = `v5-${randomUUID()}`, other = `v5-${randomUUID()}`;
let accountId: number, draftId: number;
const fetchBefore = globalThis.fetch;
beforeAll(async () => {
  if (!enabled) return;
  const db = getPostgresPool();
  await db.query('INSERT INTO ispatla_auth."user"(id,name,email,"emailVerified") VALUES($1,$1,$1||\'@test.example\',true),($2,$2,$2||\'@test.example\',true)', [owner, other]);
  accountId = Number((await db.query('INSERT INTO ispatla_app.accounts(owner_user_id,account_key,handle,x_user_id,ownership_verified_at,updated_at) VALUES($1,$1,\'fixture\',\'98765\',1,1) RETURNING id', [owner])).rows[0].id);
  draftId = Number((await db.query('INSERT INTO ispatla_app.drafts(owner_user_id,account_id,text,created_at,updated_at) VALUES($1,$2,\'prepared post\',1,1) RETURNING id', [owner, accountId])).rows[0].id);
});
afterAll(async () => {
  globalThis.fetch = fetchBefore;
  if (!enabled) return;
  await getPostgresPool().query('DELETE FROM ispatla_auth."user" WHERE id=ANY($1)', [[owner, other]]);
  await getPostgresPool().end();
});
integration("MCP consent, PKCE, audience, one-time codes, rotating refresh and revoke", async () => {
  const client = await registerMcpClient({ redirect_uris: ["http://127.0.0.1:4921/callback"], client_name: "Local test" });
  const verifier = "a".repeat(43), resource = `${mcpOrigin()}/mcp`;
  const auth = await beginMcpAuthorization(owner, new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0] as string, response_type: "code", code_challenge_method: "S256", code_challenge: pkceChallenge(verifier), resource, scope: "read drafts:write", state: "bound-state" }));
  await expect(approveMcpAuthorization(other, auth.id, true)).rejects.toThrow();
  const callback = new URL(await approveMcpAuthorization(owner, auth.id, true));
  expect(callback.searchParams.get("state")).toBe("bound-state");
  const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0] as string, grant_type: "authorization_code", code: callback.searchParams.get("code")!, code_verifier: verifier, resource });
  await expect(issueMcpTokens(new URLSearchParams({ ...Object.fromEntries(params), resource: "http://localhost:3000/wrong" }))).rejects.toThrow();
  await expect(issueMcpTokens(new URLSearchParams({ ...Object.fromEntries(params), code_verifier: "b".repeat(43) }))).rejects.toThrow();
  const raced = await Promise.allSettled([issueMcpTokens(params), issueMcpTokens(params)]);
  expect(raced.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  const token = (raced.find((item) => item.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof issueMcpTokens>>>).value;
  expect((await resolveMcpBearer(token.access_token))?.owner).toBe(owner);
  const refresh = new URLSearchParams({ client_id: client.client_id, grant_type: "refresh_token", refresh_token: token.refresh_token, resource });
  const renewed = await issueMcpTokens(refresh);
  await expect(issueMcpTokens(refresh)).rejects.toThrow();
  expect(await resolveMcpBearer(token.access_token)).toBeNull();
  await revokeMcpToken(new URLSearchParams({ client_id: client.client_id, token: renewed.refresh_token }));
  expect(await resolveMcpBearer(renewed.access_token)).toBeNull();
});
integration("receipts bind owner, immutable draft and one publication", async () => {
  const prepared = await runAsOwner(owner, () => preparePublication(draftId, "x_web_intent"));
  expect(await runAsOwner(other, () => publicationStatus(prepared.id))).toBeNull();
  globalThis.fetch = (async () => Response.json({ code: 200, tweet: { id: "123", text: "prepared post", author: { id: "98765", screen_name: "fixture" } } })) as unknown as typeof fetch;
  await expect(runAsOwner(other, () => attachPublicationReceipt(prepared.id, "https://x.com/fixture/status/123"))).rejects.toThrow();
  globalThis.fetch = (async () => Response.json({ code: 200, tweet: { id: "123", text: "prepared post", author: { id: "99999", screen_name: "wrong" } } })) as unknown as typeof fetch;
  await expect(runAsOwner(owner, () => attachPublicationReceipt(prepared.id, "https://x.com/fixture/status/123"))).rejects.toThrow();
  globalThis.fetch = (async () => Response.json({ code: 200, tweet: { id: "123", text: "prepared post", author: { id: "98765", screen_name: "fixture" } } })) as unknown as typeof fetch;
  await getPostgresPool().query("UPDATE ispatla_app.drafts SET format='reply',external_id='456' WHERE id=$1", [draftId]);
  await expect(runAsOwner(owner, () => attachPublicationReceipt(prepared.id, "https://x.com/fixture/status/123"))).rejects.toThrow();
  await getPostgresPool().query("UPDATE ispatla_app.drafts SET format='post',external_id='' WHERE id=$1", [draftId]);
  expect((await runAsOwner(owner, () => attachPublicationReceipt(prepared.id, "https://x.com/fixture/status/123")))?.evidence).toBe("fxtwitter_observed");
  globalThis.fetch = (async () => Response.json({ code: 200, tweet: { id: "124", text: "prepared post", author: { id: "98765", screen_name: "fixture" } } })) as unknown as typeof fetch;
  await expect(runAsOwner(owner, () => attachPublicationReceipt(prepared.id, "https://x.com/fixture/status/124"))).rejects.toThrow();
});
integration("ownership claim is owner-bound, provider-ID-bound and consumable once", async () => {
  const claim = await runAsOwner(owner, () => startAccountClaim(accountId));
  await expect(runAsOwner(other, () => startAccountClaim(accountId))).rejects.toThrow();
  globalThis.fetch = (async () => Response.json({ code: 200, user: { id: "98765", screen_name: "fixture", description: claim.token } })) as unknown as typeof fetch;
  globalThis.fetch = (async () => Response.json({ code: 200, user: { id: "99999", screen_name: "fixture", description: claim.token } })) as unknown as typeof fetch;
  await expect(runAsOwner(owner, () => verifyAccountClaim(accountId))).rejects.toThrow();
  globalThis.fetch = (async () => Response.json({ code: 200, user: { id: "98765", screen_name: "fixture", description: claim.token } })) as unknown as typeof fetch;
  const results = await Promise.allSettled([runAsOwner(owner, () => verifyAccountClaim(accountId)), runAsOwner(owner, () => verifyAccountClaim(accountId))]);
  expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
});
integration("dashboard reads actual selected sources and excludes another owner", async () => {
  const db = getPostgresPool();
  const handle = `s${Date.now()}`.slice(0, 15);
  await db.query('INSERT INTO ispatla_app.sources(handle,updated_at) VALUES($1,1)', [handle]);
  await db.query('INSERT INTO ispatla_app.account_sources(account_id,source_handle) VALUES($1,$2)', [accountId, handle]);
  await db.query('INSERT INTO ispatla_app.observed_posts(external_id,source_handle,text,score,observed_at) VALUES($1,$2,\'observed\',80,$3)', [`${Date.now()}`, handle, Math.floor(Date.now()/1000)]);
  const own = await runAsOwner(owner, () => getPostgresDashboardSummary());
  const foreign = await runAsOwner(other, () => getPostgresDashboardSummary());
  expect(own.sourcesConfigured).toBe(1); expect(own.postsObserved).toBe(1); expect(own.opportunities).toBe(1);
  expect(foreign.postsObserved).toBe(0); expect(foreign.recentPosts).toEqual([]);
});

integration("saved posts are private to their authenticated owner", async () => {
  await runAsOwner(owner, () => setPostgresSetting("saved_post:123", "1"));
  expect(await runAsOwner(owner, () => getPostgresSetting("saved_post:123", "0"))).toBe("1");
  expect(await runAsOwner(other, () => getPostgresSetting("saved_post:123", "0"))).toBe("0");
});

integration("MCP confirm=true never grants human publication approval", async () => {
  const { Client, InMemoryTransport } = await import("@modelcontextprotocol/client");
  const { createIspatlaMcpServer } = await import("@/server/mcp");
  const intent = await getPostgresPool().query('INSERT INTO ispatla_app.publication_intents(draft_id,account_id,idempotency_key,text,requested_at,updated_at) VALUES($1,$2,$3,\'prepared post\',1,1) RETURNING id', [draftId, accountId, randomUUID()]);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createIspatlaMcpServer({ resolveSession: async () => ({ user: { id: owner } }) });
  const client = new Client({ name: "local-approval-boundary", version: "1" });
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: "ispatla.publications.queue", arguments: { draftId, accountId, intentId: Number(intent.rows[0].id), confirm: true } });
    expect(response.isError).not.toBe(true);
    expect(JSON.stringify(response.structuredContent)).toContain('"requiresWebApproval":true');
    const row = (await getPostgresPool().query('SELECT status,approved_at FROM ispatla_app.publication_intents WHERE id=$1', [intent.rows[0].id])).rows[0];
    expect(row.status).toBe("pending_approval"); expect(row.approved_at).toBeNull();
  } finally { await client.close(); await server.close(); }
});

integration("reanalysis preserves manual voice and disabled category settings", async () => {
  const { savePostgresAccountCategory } = await import("@/server/postgres-accounts");
  const { analyzeLinkedAccount } = await import("@/server/account-link");
  const categoryInput = { slug: "manual-topic", name: "Manual topic", description: "Manual subject", enabled: true, builtIn: false, baseStrategy: "generic" as const, clusterStrategy: "topic" as const, verificationMode: "none" as const, positiveExamples: [], negativeExamples: [], keywords: ["kubernetes"], excludedKeywords: [], seedHandles: [], defaultFormats: ["post"], sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {}, aiContext: "", now: 1 };
  const category = await savePostgresAccountCategory(owner, accountId, { ...categoryInput, inferred: true });
  await savePostgresAccountCategory(owner, accountId, { ...categoryInput, id: category.id, name: "User edited topic", enabled: false, now: 2 });
  const regenerated = await savePostgresAccountCategory(owner, accountId, { ...categoryInput, inferred: true, now: 3 });
  expect(regenerated.name).toBe("User edited topic"); expect(regenerated.enabled).toBe(false);
  const style = { voice: { marker: "manual" }, voiceSource: "manual", tone: "user preference" };
  await getPostgresPool().query('UPDATE ispatla_app.accounts SET style_profile_json=$1 WHERE id=$2', [JSON.stringify(style), accountId]);
  globalThis.fetch = (async (input: string | URL | Request) => Response.json(String(input).includes("/statuses") ? { code: 200, results: [1, 2, 3].map((id) => ({ id: String(id), text: "Kubernetes services and distributed infrastructure are discussed with practical evidence.", author: { id: "98765", screen_name: "fixture" } })) } : { code: 200, user: { id: "98765", screen_name: "fixture", description: "Kubernetes infrastructure" } })) as unknown as typeof fetch;
  await runAsOwner(owner, () => analyzeLinkedAccount(accountId));
  const saved = JSON.parse((await getPostgresPool().query('SELECT style_profile_json FROM ispatla_app.accounts WHERE id=$1', [accountId])).rows[0].style_profile_json);
  expect(saved.voice).toEqual(style.voice); expect(saved.tone).toBe(style.tone);
});

test.skipIf(!enabled || process.env.ISPATLA_TEST_MCP_HTTP !== "1")("remote MCP HTTP handshake enforces scopes and revocation", async () => {
  globalThis.fetch = fetchBefore;
  const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
  const resource = `${mcpOrigin()}/mcp`, verifier = "v".repeat(43);
  const registered = await registerMcpClient({ redirect_uris: ["http://127.0.0.1:4922/callback"], client_name: "Local HTTP fixture" });
  const authorization = await beginMcpAuthorization(owner, new URLSearchParams({ client_id: registered.client_id, redirect_uri: registered.redirect_uris[0] as string, response_type: "code", code_challenge_method: "S256", code_challenge: pkceChallenge(verifier), resource, scope: "read" }));
  const callback = new URL(await approveMcpAuthorization(owner, authorization.id, true));
  const tokens = await issueMcpTokens(new URLSearchParams({ client_id: registered.client_id, redirect_uri: registered.redirect_uris[0] as string, grant_type: "authorization_code", code: callback.searchParams.get("code")!, code_verifier: verifier, resource }));
  const client = new Client({ name: "HTTP fixture", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }));
    expect((await fetch(resource, { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}`, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" })).status).toBe(403);
    expect((await client.listTools()).tools.length).toBeGreaterThan(10);
    expect((await client.callTool({ name: "ispatla.publishing.methods", arguments: {} })).isError).not.toBe(true);
    expect((await client.callTool({ name: "ispatla.accounts.analyze", arguments: { accountId } })).isError).toBe(true);
    expect((await client.callTool({ name: "ispatla.publications.queue", arguments: { draftId, confirm: true } })).isError).toBe(true);
    await revokeMcpToken(new URLSearchParams({ client_id: registered.client_id, token: tokens.refresh_token }));
    expect((await fetch(resource, { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" }, body: "{}" })).status).toBe(401);
  } finally { await client.close().catch(() => undefined); }
});

integration("legacy X sessions migrate to verified email and password without losing accounts", async () => {
  const { createAuthRuntime } = await import("@/server/auth");
  const { serializeSignedCookie } = await import("better-call");
  const db = getPostgresPool(), secret = process.env.BETTER_AUTH_SECRET!;
  const sessionToken = randomUUID(), sessionId = randomUUID();
  await db.query('UPDATE ispatla_auth."user" SET email=$1,"emailVerified"=false WHERE id=$2', [`x-98765@users.ispatla.invalid`, owner]);
  await db.query('INSERT INTO ispatla_auth.session(id,token,"userId","expiresAt") VALUES($1,$2,$3,$4)', [sessionId, sessionToken, owner, new Date(Date.now()+3600000)]);
  const cookie = (await serializeSignedCookie("better-auth.session_token", sessionToken, secret, { path: "/" })).split(";")[0]!;
  const headers = new Headers({ cookie, origin: mcpOrigin(), "content-type": "application/json" });
  let sentLink = "";
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const message = JSON.parse(String(init?.body));
    sentLink = message.text.match(/https?:\/\/\S+/)?.[0] || "";
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const runtime = await createAuthRuntime({ env: { ...process.env, ISPATLA_MAIL_API_URL: "http://127.0.0.1:4923/mail", ISPATLA_MAIL_API_TOKEN: "local-mail-fixture" } });
  try {
    const newEmail = `legacy-${randomUUID()}@gmail.com`;
    await runtime.auth.api.changeEmail({ headers, body: { newEmail, callbackURL: `${mcpOrigin()}/settings/security` } });
    expect(sentLink).toContain("/verify-email?");
    expect((await db.query('SELECT email FROM ispatla_auth."user" WHERE id=$1', [owner])).rows[0].email).toEndWith(".invalid");
    const verification = await runtime.handler(new Request(sentLink));
    expect(verification.status).toBeLessThan(400);
    const user = (await db.query('SELECT email,"emailVerified" FROM ispatla_auth."user" WHERE id=$1', [owner])).rows[0];
    expect(user.email).toBe(newEmail); expect(user.emailVerified).toBe(true);
    await runtime.auth.api.setPassword({ headers, body: { newPassword: "LocalMigrationTest123!" } });
    const login = await runtime.auth.api.signInEmail({ body: { email: newEmail, password: "LocalMigrationTest123!" } });
    expect(login.user.id).toBe(owner);
    expect((await db.query('SELECT id FROM ispatla_app.accounts WHERE id=$1 AND owner_user_id=$2', [accountId, owner])).rows).toHaveLength(1);
    expect((await runtime.handler(new Request(sentLink))).status).toBe(400);
  } finally { runtime.close(); globalThis.fetch = fetchBefore; }
}, 15_000);

integration("multiple custom categories retain one primary, including concurrent creation", async () => {
  const { savePostgresAccountCategory } = await import("@/server/postgres-accounts");
  const id = Number((await getPostgresPool().query('INSERT INTO ispatla_app.accounts(owner_user_id,account_key,handle,updated_at) VALUES($1,$2,\'categoryfixture\',1) RETURNING id', [owner, randomUUID()])).rows[0].id);
  const input = { name: "Fixture topic", description: "Isolated category test", enabled: true, builtIn: false, baseStrategy: "generic" as const, clusterStrategy: "topic" as const, verificationMode: "moderate" as const, positiveExamples: [], negativeExamples: [], keywords: ["testing"], excludedKeywords: [], seedHandles: [], defaultFormats: ["post"], sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {}, aiContext: "", now: 1 };
  const first = await savePostgresAccountCategory(owner, id, { ...input, slug: "first" });
  await Promise.all(["second", "third"].map(slug => savePostgresAccountCategory(owner, id, { ...input, slug })));
  const rows = (await getPostgresPool().query('SELECT category_id,is_primary FROM ispatla_app.account_categories WHERE account_id=$1', [id])).rows;
  expect(rows).toHaveLength(3);
  expect(rows.filter(row => row.is_primary === 1).map(row => Number(row.category_id))).toEqual([first.id]);
});
