import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readBoundedBody } from "./api-guard";
import { sql } from "drizzle-orm";
import { getPostgresDb } from "./postgres";
import { isAuthenticatedUserDisabled } from "./auth";

export const MCP_SCOPES = ["read", "drafts:write", "analysis:write", "publishing:prepare", "receipts:write"] as const;
export function mcpOrigin() {
  const url = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("HTTPS issuer required");
  return url.origin;
}
export const tokenDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export const pkceChallenge = (value: string) => createHash("sha256").update(value).digest("base64url");
const now = () => Math.floor(Date.now() / 1000);
const secret = () => randomBytes(32).toString("base64url");

export function validRedirect(value: string) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch { return false; }
}
export function normalizeMcpScopes(value: string) {
  const scopes = [...new Set(value.split(" ").filter(Boolean))];
  if (!scopes.length || scopes.some((scope) => !MCP_SCOPES.includes(scope as typeof MCP_SCOPES[number]))) throw new Error("invalid_scope");
  return scopes.join(" ");
}
export function authorizeMcpTool(scope: string, name: string, readOnly: boolean) {
  const allowed = new Set(scope.split(" "));
  const required = readOnly ? "read" : name.startsWith("ispatla.accounts.") ? "analysis:write" : name === "ispatla.publications.prepare" ? "publishing:prepare" : name === "ispatla.publications.attach_receipt" ? "receipts:write" : name.startsWith("ispatla.drafts.") ? "drafts:write" : null;
  if (!required || !allowed.has(required)) throw new Error("insufficient_scope");
}

export async function admitMcp(key: string, maximum = 100) {
  const time = now();
  const result = await getPostgresDb().execute(sql`INSERT INTO ispatla_app.mcp_admission AS a(key,count,window_started_at) VALUES(${key},1,${time})
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN a.window_started_at<=${time - 60} THEN 1 ELSE a.count+1 END,
    window_started_at=CASE WHEN a.window_started_at<=${time - 60} THEN EXCLUDED.window_started_at ELSE a.window_started_at END
    WHERE a.window_started_at<=${time - 60} OR a.count<${maximum} RETURNING key`);
  if (!result.rows.length) throw new Error("rate_limit_exceeded");
}

export async function registerMcpClient(body: Record<string, unknown>) {
  await admitMcp("registration", 10);
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 5 || body.redirect_uris.some((uri) => typeof uri !== "string" || uri.length > 2048 || !validRedirect(uri))) throw new Error("invalid_redirect_uri");
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") throw new Error("invalid_client_metadata");
  const id = randomUUID();
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "MCP client";
  await getPostgresDb().execute(sql`INSERT INTO ispatla_app.mcp_clients(id,name,redirect_uris,created_at) VALUES(${id},${name},${JSON.stringify(body.redirect_uris)}::jsonb,${now()})`);
  return { client_id: id, client_name: name, redirect_uris: body.redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}

export async function beginMcpAuthorization(owner: string, params: URLSearchParams) {
  await admitMcp(`authorize:${owner}`, 20);
  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const challenge = params.get("code_challenge") || "";
  const state = params.get("state") || "";
  const audience = `${mcpOrigin()}/mcp`;
  if (!/^[a-f0-9-]{36}$/.test(clientId) || params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || state.length > 1024 || params.get("resource") !== audience) throw new Error("invalid_request");
  const client = await getPostgresDb().execute(sql`SELECT name,redirect_uris FROM ispatla_app.mcp_clients WHERE id=${clientId}`);
  const row = client.rows[0];
  if (!row || !(row.redirect_uris as string[]).includes(redirectUri)) throw new Error("invalid_redirect_uri");
  const scope = normalizeMcpScopes(params.get("scope") || "read");
  const id = randomUUID();
  await getPostgresDb().execute(sql`INSERT INTO ispatla_app.mcp_authorizations(id,owner_user_id,client_id,redirect_uri,state,challenge,scope,audience,expires_at)
    VALUES(${id},${owner},${clientId},${redirectUri},${state},${challenge},${scope},${audience},${now() + 600})`);
  return { id, name: String(row.name), scope, redirectUri };
}

export async function approveMcpAuthorization(owner: string, id: string, approved: boolean) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid_request");
  return getPostgresDb().transaction(async (tx) => {
    const result = await tx.execute(sql`SELECT * FROM ispatla_app.mcp_authorizations WHERE id=${id} AND owner_user_id=${owner} AND expires_at>${now()} AND code_hash IS NULL AND consumed_at IS NULL FOR UPDATE`);
    const row = result.rows[0];
    if (!row) throw new Error("invalid_request");
    const redirect = new URL(String(row.redirect_uri));
    redirect.searchParams.set("state", String(row.state));
    if (approved) {
      const code = secret();
      await tx.execute(sql`UPDATE ispatla_app.mcp_authorizations SET code_hash=${tokenDigest(code)} WHERE id=${id}`);
      redirect.searchParams.set("code", code);
    } else {
      await tx.execute(sql`UPDATE ispatla_app.mcp_authorizations SET consumed_at=${now()} WHERE id=${id}`);
      redirect.searchParams.set("error", "access_denied");
    }
    return redirect.href;
  });
}

export async function issueMcpTokens(params: URLSearchParams) {
  await admitMcp("token", 100);
  const clientId = params.get("client_id") || "";
  if (!/^[a-f0-9-]{36}$/.test(clientId) || params.get("resource") !== `${mcpOrigin()}/mcp`) throw new Error("invalid_request");
  const time = now();
  return getPostgresDb().transaction(async (tx) => {
    const access = secret(), refresh = secret();
    let row: Record<string, unknown> | undefined;
    if (params.get("grant_type") === "authorization_code") {
      const verifier = params.get("code_verifier") || "";
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error("invalid_grant");
      const result = await tx.execute(sql`SELECT * FROM ispatla_app.mcp_authorizations WHERE code_hash=${tokenDigest(params.get("code") || "")} AND client_id=${clientId} AND consumed_at IS NULL AND expires_at>${time} FOR UPDATE`);
      row = result.rows[0];
      if (!row || row.redirect_uri !== params.get("redirect_uri") || row.challenge !== pkceChallenge(verifier) || row.audience !== params.get("resource") || (await tx.execute(sql`SELECT 1 FROM ispatla_auth.auth_user_status WHERE owner_user_id=${row.owner_user_id} AND status='disabled'`)).rows.length > 0) throw new Error("invalid_grant");
      await tx.execute(sql`UPDATE ispatla_app.mcp_authorizations SET consumed_at=${time} WHERE id=${row.id}`);
      await tx.execute(sql`INSERT INTO ispatla_app.mcp_grants(id,owner_user_id,client_id,scope,audience,token_hash,refresh_hash,expires_at,refresh_expires_at)
        VALUES(${randomUUID()},${row.owner_user_id},${clientId},${row.scope},${row.audience},${tokenDigest(access)},${tokenDigest(refresh)},${time + 3600},${time + 30 * 86400})`);
    } else if (params.get("grant_type") === "refresh_token") {
      const result = await tx.execute(sql`SELECT * FROM ispatla_app.mcp_grants WHERE refresh_hash=${tokenDigest(params.get("refresh_token") || "")} AND client_id=${clientId} AND audience=${params.get("resource")} AND revoked_at IS NULL AND refresh_expires_at>${time} FOR UPDATE`);
      row = result.rows[0];
      if (!row || (await tx.execute(sql`SELECT 1 FROM ispatla_auth.auth_user_status WHERE owner_user_id=${row.owner_user_id} AND status='disabled'`)).rows.length > 0) throw new Error("invalid_grant");
      if (params.get("scope") && params.get("scope") !== row.scope) throw new Error("invalid_scope");
      await tx.execute(sql`UPDATE ispatla_app.mcp_grants SET token_hash=${tokenDigest(access)},refresh_hash=${tokenDigest(refresh)},expires_at=${time + 3600} WHERE id=${row.id}`);
    } else throw new Error("unsupported_grant_type");
    return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope: row.scope };
  });
}

export async function resolveMcpBearer(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await getPostgresDb().execute(sql`SELECT owner_user_id,scope FROM ispatla_app.mcp_grants WHERE token_hash=${tokenDigest(token)} AND audience=${`${mcpOrigin()}/mcp`} AND revoked_at IS NULL AND expires_at>${now()}`);
  const row = result.rows[0];
  if (!row || await isAuthenticatedUserDisabled(String(row.owner_user_id))) return null;
  return { owner: String(row.owner_user_id), scope: String(row.scope) };
}

export async function revokeMcpToken(params: URLSearchParams) {
  const clientId = params.get("client_id") || "";
  if (!/^[a-f0-9-]{36}$/.test(clientId)) return;
  const digest = tokenDigest(params.get("token") || "");
  await getPostgresDb().execute(sql`UPDATE ispatla_app.mcp_grants SET revoked_at=${now()} WHERE client_id=${clientId} AND (token_hash=${digest} OR refresh_hash=${digest})`);
}

export async function readMcpForm(request: Request) {
  const text = await readBoundedBody(request, 16_384);
  return new URLSearchParams(text);
}
