import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { sql } from "drizzle-orm";
import { getPostgresDb } from "@/server/postgres";
import { isLocale } from "@/i18n/config";
import { X_CONSENT_COPY_VERSION, X_POLICY_VERSION } from "./x-policy";

// pg returns dynamic row shapes from raw SQL, which callers validate per query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawResult = { rows: any[]; rowCount: number | null };

export const POSTGRES_X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"] as const;
export const AUTOMATION_ACTIONS = ["post", "repost", "reply", "future_quote"] as const;
const TTL_SECONDS = 10 * 60;
const REFRESH_LEASE_SECONDS = 30;
const AUTHORIZATION_ENDPOINT = "https://x.com/i/oauth2/authorize";
const TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const ME_ENDPOINT = "https://api.x.com/2/users/me?user.fields=name,username,description,profile_image_url,protected";
type Env = Record<string, string | undefined>;
type Fetcher = typeof fetch;

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function nowSeconds(now?: number) { return now ?? Math.floor(Date.now() / 1000); }

let keyFingerprint = "";
let keys = new Map<string, string>();
function tokenKeys(env: Env = process.env) {
  const current = env.ISPATLA_TOKEN_KEY_CURRENT || env.ISPATLA_SECRET_KEY;
  if (!current) throw new Error("ISPATLA_TOKEN_KEY_CURRENT must be configured");
  const currentId = env.ISPATLA_TOKEN_KEY_CURRENT ? "current" : "legacy-vault";
  const previous = Object.entries(env).flatMap(([name, value]) => {
    const match = /^ISPATLA_TOKEN_KEY_PREVIOUS_([A-Za-z0-9_-]+)$/.exec(name);
    return match && value ? [[`previous-${match[1]}`, value] as const] : [];
  });
  const fingerprint = JSON.stringify([[currentId, current], ...previous]);
  if (fingerprint !== keyFingerprint) {
    keyFingerprint = fingerprint;
    keys = new Map([[currentId, current], ...previous]);
  }
  return keys;
}

function seal(value: string, env?: Env) {
  const [keyId, secret] = tokenKeys(env).entries().next().value as [string, string];
  const key = scryptSync(secret, `ispatla-x-token-v1:${keyId}`, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { keyId, value: `v2:${keyId}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}` };
}

function open(value: string, env?: Env) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "v2") throw new Error("invalid 𝕏 credential envelope");
  const [, keyId, iv, tag, ciphertext] = parts;
  const available = tokenKeys(env);
  const secrets = keyId === "current" || keyId === "legacy-vault" ? [...available.values()] : [available.get(keyId)].filter((key): key is string => Boolean(key));
  const candidates = secrets.map((secret) => scryptSync(secret, `ispatla-x-token-v1:${keyId}`, 32));
  if (!candidates.length) throw new Error("𝕏 credential decryption key is not configured");
  for (const key of candidates) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    } catch { /* Try another explicitly configured rotation key. */ }
  }
  throw new Error("𝕏 credential decryption failed");
}

function config(env: Env) {
  if (env.ISPATLA_DEMO === "1") throw new Error("𝕏 OAuth is disabled in demo mode");
  const clientId = env.X_OAUTH_CLIENT_ID;
  const redirectUri = env.X_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error("𝕏 OAuth is not configured");
  let parsed: URL;
  try { parsed = new URL(redirectUri); } catch { throw new Error("𝕏 OAuth callback must be an absolute URL"); }
  const production = env.NODE_ENV === "production";
  if (parsed.pathname !== "/api/x/oauth/callback" || parsed.search || parsed.hash || parsed.username || parsed.password
    || (production ? parsed.protocol !== "https:" : !["https:", "http:"].includes(parsed.protocol))) {
    throw new Error("𝕏 OAuth callback URL is not allowed");
  }
  const clientSecret = env.X_OAUTH_CLIENT_SECRET;
  if (production && !clientSecret) throw new Error("X_OAUTH_CLIENT_SECRET must be configured in production");
  return { clientId, clientSecret, redirectUri };
}

function returnPath(value?: string) {
  if (!value) return "/accounts";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) throw new Error("OAuth return path is not allowed");
  const url = new URL(value, "https://ispatla.invalid");
  const firstSegment = url.pathname.split("/")[1] || "";
  const path = isLocale(firstSegment) ? url.pathname.slice(firstSegment.length + 1) || "/" : url.pathname;
  if (url.origin !== "https://ispatla.invalid" || !["/accounts", "/settings", "/onboarding"].includes(path)) throw new Error("OAuth return path is not allowed");
  return `${url.pathname}${url.search}`;
}

export async function startPostgresXOAuth(input: {
  ownerUserId: string; sessionId: string; returnTo?: string; now?: number; env?: Env;
}): Promise<{ authorizationUrl: string; expiresAt: number }> {
  if (!input.ownerUserId.trim() || !input.sessionId.trim()) throw new Error("authenticated app session required");
  const env = input.env || process.env;
  const oauth = config(env);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const expiresAt = nowSeconds(input.now) + TTL_SECONDS;
  const scopes = [...POSTGRES_X_OAUTH_SCOPES];
  await getPostgresDb().execute(sql`INSERT INTO ispatla_app.x_oauth_transactions
      (id, owner_user_id, session_hash, state_hash, encrypted_code_verifier, requested_scopes, return_to, expires_at, created_at)
     VALUES (${randomUUID()},${input.ownerUserId},${hash(input.sessionId)},${hash(state)},${seal(verifier, env).value},${sql.param(scopes)}::text[],${returnPath(input.returnTo)},${expiresAt},${nowSeconds(input.now)})`);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({ response_type: "code", client_id: oauth.clientId, redirect_uri: oauth.redirectUri,
    scope: scopes.join(" "), state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return { authorizationUrl: url.toString(), expiresAt };
}

type OAuthTransaction = { codeVerifier: string; returnTo: string };
async function consumeTransaction(input: { state: string; ownerUserId: string; sessionId: string; now?: number; env: Env }): Promise<OAuthTransaction | null> {
  const now = nowSeconds(input.now);
  const result = await getPostgresDb().execute(sql`UPDATE ispatla_app.x_oauth_transactions SET consumed_at = ${now}
     WHERE state_hash = ${hash(input.state)} AND owner_user_id = ${input.ownerUserId} AND session_hash = ${hash(input.sessionId)}
       AND consumed_at IS NULL AND expires_at > ${now} RETURNING encrypted_code_verifier, return_to`) as unknown as RawResult;
  const row = result.rows[0];
  return row ? { codeVerifier: open(row.encrypted_code_verifier, input.env), returnTo: row.return_to } : null;
}

async function readJson(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(body.error === "invalid_grant" ? "invalid_grant" : "provider_error");
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function providerFetch(fetcher: Fetcher, url: string, init: RequestInit) {
  return fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
}

export async function completePostgresXOAuth(input: {
  request: Request; ownerUserId: string; sessionId: string; now?: number; env?: Env; fetcher?: Fetcher;
}): Promise<{ accountId: number; handle: string; displayName: string; returnTo: string }> {
  if (!input.ownerUserId.trim() || !input.sessionId.trim()) throw new Error("authenticated app session required");
  const env = input.env || process.env;
  const oauth = config(env);
  const url = new URL(input.request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!state || !code || code.length > 2048 || state.length > 500) throw new Error("invalid OAuth callback");
  if (url.searchParams.has("error")) throw new Error("𝕏 authorization was not completed");
  const transaction = await consumeTransaction({ state, ownerUserId: input.ownerUserId, sessionId: input.sessionId, now: input.now, env });
  if (!transaction) throw new Error("OAuth transaction expired or already used");

  const fetcher = input.fetcher || fetch;
  const tokenHeaders = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
  if (oauth.clientSecret) tokenHeaders.set("authorization", `Basic ${Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64")}`);
  const tokenBody = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: oauth.redirectUri, code_verifier: transaction.codeVerifier });
  if (!oauth.clientSecret) tokenBody.set("client_id", oauth.clientId);
  const tokenData = await readJson(await providerFetch(fetcher, TOKEN_ENDPOINT, { method: "POST", headers: tokenHeaders, body: tokenBody }));
  const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";
  const refreshToken = typeof tokenData.refresh_token === "string" ? tokenData.refresh_token : "";
  const expiresIn = Number(tokenData.expires_in);
  const scopes = typeof tokenData.scope === "string" ? tokenData.scope.split(/\s+/).filter(Boolean) : [];
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn < 1) throw new Error("𝕏 did not issue a renewable account grant");
  if (POSTGRES_X_OAUTH_SCOPES.some((scope) => !scopes.includes(scope))) throw new Error("required 𝕏 permissions are missing");
  const meData = await readJson(await providerFetch(fetcher, ME_ENDPOINT, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } }));
  const user = meData.data as Record<string, unknown> | undefined;
  if (!user || typeof user.id !== "string" || typeof user.username !== "string") throw new Error("𝕏 identity response is invalid");
  const handle = user.username.replace(/^@/, "").trim().toLowerCase();
  if (!/^\d+$/.test(user.id) || !/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("𝕏 identity response is invalid");
  const displayName = (typeof user.name === "string" ? user.name : handle).slice(0, 100);
  const bio = typeof user.description === "string" ? user.description.slice(0, 500) : "";
  const account = await storeXGrant({ ownerUserId: input.ownerUserId, xUserId: user.id, handle, displayName,
    bio, protected: typeof user.protected === "boolean" ? user.protected : null, accessToken, refreshToken,
    scopes, expiresAt: nowSeconds(input.now) + expiresIn, now: input.now, env });
  return { ...account, returnTo: transaction.returnTo };
}

async function storeXGrant(input: {
  ownerUserId: string; xUserId: string; handle: string; displayName: string; bio: string; protected: boolean | null;
  accessToken: string; refreshToken: string; scopes: string[]; expiresAt: number; now?: number; env: Env;
}) {
  const now = nowSeconds(input.now);
  const access = seal(input.accessToken, input.env);
  const refresh = seal(input.refreshToken, input.env);
  let accountId: number;
  let connectedAt: number;
  await getPostgresDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.xUserId}, 0))`);
    const mapping = await tx.execute(sql`SELECT owner_user_id, account_id, connected_at FROM ispatla_app.x_oauth_accounts WHERE x_user_id=${input.xUserId} FOR UPDATE`) as unknown as RawResult;
    const mapped = mapping.rows[0];
    if (mapped && mapped.owner_user_id !== input.ownerUserId) throw new Error("𝕏 account is already connected to another user");
    const existing = mapped ? { rows: [{ id: mapped.account_id }] } : await tx.execute(sql`SELECT id FROM ispatla_app.accounts WHERE owner_user_id=${input.ownerUserId}
      AND (account_key=${`x:${input.xUserId}`} OR handle=${input.handle}) AND NOT EXISTS
      (SELECT 1 FROM ispatla_app.x_oauth_accounts mapped WHERE mapped.account_id=accounts.id) LIMIT 1 FOR UPDATE`) as unknown as RawResult;
    if (existing.rows[0]) {
      accountId = Number(existing.rows[0].id);
      await tx.execute(sql`UPDATE ispatla_app.accounts SET handle=${input.handle}, display_name=${input.displayName}, updated_at=${now}
        WHERE id=${accountId} AND owner_user_id=${input.ownerUserId}`);
    } else {
      const count = await tx.execute(sql`SELECT count(*)::text AS count FROM ispatla_app.accounts WHERE owner_user_id=${input.ownerUserId}`) as unknown as RawResult;
      const inserted = await tx.execute(sql`INSERT INTO ispatla_app.accounts(account_key,owner_user_id,handle,display_name,enabled,default_account,automation_mode,daily_limit,capabilities_json,style_profile_json,updated_at)
        VALUES(${`x:${input.xUserId}`},${input.ownerUserId},${input.handle},${input.displayName},TRUE,${Number(count.rows[0]?.count || 0) === 0},'manual',24,'[]','{}',${now}) RETURNING id`) as unknown as RawResult;
      accountId = Number(inserted.rows[0].id);
    }
    connectedAt = mapped ? Number(mapped.connected_at) : now;
    const mappingSaved = await tx.execute(sql`INSERT INTO ispatla_app.x_oauth_accounts(x_user_id,owner_user_id,account_id,handle,display_name,auth_state,connected_at,last_health_at,last_auth_error)
       VALUES(${input.xUserId},${input.ownerUserId},${accountId},${input.handle},${input.displayName},'connected',${connectedAt},${connectedAt},'')
       ON CONFLICT(x_user_id) DO UPDATE SET handle=EXCLUDED.handle,display_name=EXCLUDED.display_name,auth_state='connected',last_health_at=EXCLUDED.last_health_at,last_auth_error=''
       WHERE ispatla_app.x_oauth_accounts.owner_user_id=EXCLUDED.owner_user_id`) as unknown as RawResult;
    if (mappingSaved.rowCount !== 1) throw new Error("𝕏 account is already connected to another user");
    const credentialSaved = await tx.execute(sql`INSERT INTO ispatla_app.x_oauth_credentials(account_id,owner_user_id,encrypted_access_token,encrypted_refresh_token,encryption_key_id,access_expires_at,scopes,token_version,refreshed_at,created_at,updated_at)
       VALUES(${accountId},${input.ownerUserId},${access.value},${refresh.value},${access.keyId},${input.expiresAt},${sql.param([...new Set(input.scopes)])}::text[],1,${now},${now},${now})
       ON CONFLICT(account_id) DO UPDATE SET encrypted_access_token=EXCLUDED.encrypted_access_token,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,
       encryption_key_id=EXCLUDED.encryption_key_id,access_expires_at=EXCLUDED.access_expires_at,scopes=EXCLUDED.scopes,
       token_version=ispatla_app.x_oauth_credentials.token_version+1,refreshed_at=EXCLUDED.refreshed_at,revoked_at=NULL,refresh_lease_id=NULL,refresh_lease_until=0,updated_at=EXCLUDED.updated_at
      WHERE ispatla_app.x_oauth_credentials.owner_user_id=EXCLUDED.owner_user_id`) as unknown as RawResult;
    if (credentialSaved.rowCount !== 1) throw new Error("𝕏 credential owner mismatch");
    for (const action of AUTOMATION_ACTIONS) {
      await tx.execute(sql`INSERT INTO ispatla_app.automation_consents(account_id,owner_user_id,action_type,mode,policy_version,consent_copy_version,updated_at)
         VALUES(${accountId},${input.ownerUserId},${action},'shadow',${X_POLICY_VERSION},${X_CONSENT_COPY_VERSION},${now}) ON CONFLICT(account_id,action_type) DO NOTHING`);
    }
    await tx.execute(sql`INSERT INTO ispatla_app.user_profiles(owner_user_id,username,created_at,updated_at)
       VALUES(${input.ownerUserId},${randomBytes(18).toString("base64url")},${now},${now}) ON CONFLICT(owner_user_id) DO NOTHING`);
    await tx.execute(sql`INSERT INTO ispatla_app.user_profile_x_identity(owner_user_id,x_user_id) VALUES(${input.ownerUserId},${input.xUserId})
       ON CONFLICT DO NOTHING`);
    const profileIdentity = await tx.execute(sql`SELECT x_user_id FROM ispatla_app.user_profile_x_identity WHERE owner_user_id=${input.ownerUserId}`) as unknown as RawResult;
    if (profileIdentity.rows[0]?.x_user_id === input.xUserId) {
      await tx.execute(sql`UPDATE ispatla_app.user_profiles SET x_handle=${input.handle},display_name=${input.displayName.slice(0,80)},bio=${input.bio},
         visibility=CASE WHEN ${input.protected}::boolean IS NULL THEN visibility WHEN ${input.protected} THEN 'private' ELSE 'public' END,updated_at=${now}
         WHERE owner_user_id=${input.ownerUserId}`);
    }
  });
  return { accountId: accountId!, handle: input.handle, displayName: input.displayName, connectedAt: connectedAt! };
}

export async function connectPostgresXAccount(input: {
  ownerUserId: string; xUserId: string; handle: string; displayName?: string; bio?: string; protected?: boolean | null;
  accessToken: string; refreshToken: string; expiresAt: number; scopes: string[]; now?: number; env?: Env;
}) {
  if (!input.ownerUserId.trim() || !/^\d+$/.test(input.xUserId) || !input.accessToken || !input.refreshToken) throw new Error("invalid 𝕏 account grant");
  if (POSTGRES_X_OAUTH_SCOPES.some((scope) => !input.scopes.includes(scope))) throw new Error("required 𝕏 permissions are missing");
  const handle = input.handle.replace(/^@/, "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("invalid 𝕏 username");
  return storeXGrant({ ownerUserId: input.ownerUserId, xUserId: input.xUserId, handle,
    displayName: (input.displayName || handle).slice(0, 100), bio: (input.bio || "").slice(0, 500),
    protected: input.protected ?? null, accessToken: input.accessToken, refreshToken: input.refreshToken,
    scopes: [...new Set(input.scopes)], expiresAt: input.expiresAt, now: input.now, env: input.env || process.env });
}

export type PostgresXCredential = {
  accountId: number; ownerUserId: string; xUserId: string; handle: string; displayName: string;
  accessToken: string; refreshToken: string; expiresAt: number; scopes: string[]; version: number;
  authState: string; revokedAt: number | null;
};

export async function getPostgresXCredential(accountId: number, ownerUserId: string): Promise<PostgresXCredential | null> {
  const result = await getPostgresDb().execute(sql`SELECT a.x_user_id,a.handle,a.display_name,a.auth_state,c.encrypted_access_token,c.encrypted_refresh_token,
      c.encryption_key_id,c.access_expires_at,c.scopes,c.token_version,c.revoked_at
     FROM ispatla_app.x_oauth_accounts a JOIN ispatla_app.x_oauth_credentials c USING(account_id)
     WHERE a.account_id=${accountId} AND a.owner_user_id=${ownerUserId} AND c.owner_user_id=${ownerUserId}`) as unknown as RawResult;
  const row = result.rows[0];
  if (!row) return null;
  const revokedAt = row.revoked_at == null ? null : Number(row.revoked_at);
  return { accountId, ownerUserId, xUserId: row.x_user_id, handle: row.handle, displayName: row.display_name,
    accessToken: revokedAt === null ? open(row.encrypted_access_token) : "",
    refreshToken: revokedAt === null ? open(row.encrypted_refresh_token) : "",
    expiresAt: Number(row.access_expires_at), scopes: row.scopes, version: Number(row.token_version),
    authState: row.auth_state, revokedAt };
}

export async function getPostgresXAccountAuthState(accountId: number, ownerUserId: string) {
  const result = await getPostgresDb().execute(sql`SELECT a.x_user_id,a.handle,a.display_name,a.auth_state,a.connected_at,a.last_health_at,a.last_auth_error,
      c.access_expires_at,c.scopes,c.refreshed_at,c.revoked_at,c.token_version
     FROM ispatla_app.x_oauth_accounts a LEFT JOIN ispatla_app.x_oauth_credentials c USING(account_id)
     WHERE a.account_id=${accountId} AND a.owner_user_id=${ownerUserId}`) as unknown as RawResult;
  const row = result.rows[0];
  if (!row) return null;
  const consents = await getPostgresDb().execute(sql`SELECT action_type,mode,policy_version,consent_copy_version,daily_limit,cadence_seconds,version,granted_at,revoked_at
     FROM ispatla_app.automation_consents WHERE account_id=${accountId} AND owner_user_id=${ownerUserId} ORDER BY action_type`) as unknown as RawResult;
  return { connected: row.revoked_at == null && row.auth_state === "connected", handle: row.handle, xUserId: row.x_user_id,
    authState: row.auth_state, connectedAt: Number(row.connected_at), lastHealthAt: Number(row.last_health_at),
    lastAuthError: row.last_auth_error, expiresAt: row.access_expires_at == null ? null : Number(row.access_expires_at),
    scopes: row.scopes || [], refreshedAt: row.refreshed_at == null ? null : Number(row.refreshed_at),
    tokenVersion: row.token_version == null ? null : Number(row.token_version), consents: consents.rows.map((consent) => ({
      action: consent.action_type as typeof AUTOMATION_ACTIONS[number],
      mode: consent.mode === "shadow" ? "observe" : consent.mode === "manual" ? "assist" : consent.mode,
      policyVersion: consent.policy_version, copyVersion: consent.consent_copy_version,
      dailyLimit: Number(consent.daily_limit), cadenceSeconds: Number(consent.cadence_seconds), version: Number(consent.version),
      grantedAt: consent.granted_at == null ? null : Number(consent.granted_at), revokedAt: consent.revoked_at == null ? null : Number(consent.revoked_at),
    })) };
}

export async function setPostgresAutomationConsent(input: {
  accountId: number; ownerUserId: string; action: typeof AUTOMATION_ACTIONS[number]; mode: "observe" | "assist" | "auto" | "off";
  policyVersion: string; copyVersion: string; dailyLimit: number; cadenceSeconds: number; expectedVersion: number; now?: number;
}) {
  const mode = input.mode === "observe" ? "shadow" : input.mode === "assist" ? "manual" : input.mode;
  const now = nowSeconds(input.now);
  return getPostgresDb().transaction(async (tx) => {
    const current = await tx.execute(sql`SELECT version,revoked_at,mode,granted_at FROM ispatla_app.automation_consents
       WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} AND action_type=${input.action} FOR UPDATE`) as unknown as RawResult;
    const existing = current.rows[0];
    if (!existing) throw new Error("account not found");
    if (Number(existing.version) !== input.expectedVersion) throw new Error("consent version conflict");
    if (mode === "auto") {
      const linked = await tx.execute(sql`SELECT 1 FROM ispatla_app.x_oauth_accounts a JOIN ispatla_app.x_oauth_credentials c USING(account_id)
         WHERE a.account_id=${input.accountId} AND a.owner_user_id=${input.ownerUserId} AND a.auth_state='connected' AND c.revoked_at IS NULL`) as unknown as RawResult;
      if (!linked.rowCount) throw new Error("a connected 𝕏 grant is required for automation consent");
    }
    if (!Number.isSafeInteger(input.dailyLimit) || input.dailyLimit < 0 || input.dailyLimit > 1000
      || !Number.isSafeInteger(input.cadenceSeconds) || input.cadenceSeconds < 0 || input.cadenceSeconds > 86400
      || !input.policyVersion.trim() || !input.copyVersion.trim()) throw new Error("invalid automation consent policy");
    if (mode === "auto" && (input.policyVersion !== X_POLICY_VERSION || input.copyVersion !== X_CONSENT_COPY_VERSION || input.dailyLimit < 1 || input.cadenceSeconds < 1)) {
      throw new Error("current explicit automation policy consent is required");
    }
    const revoking = mode === "off" || (existing.mode === "auto" && mode !== "auto");
    const version = Number(existing.version) + 1;
    const grantedAt = mode === "auto" ? now : existing.granted_at == null ? null : Number(existing.granted_at);
    const revokedAt = mode === "auto" ? null : revoking ? now : existing.revoked_at == null ? null : Number(existing.revoked_at);
    const saved = await tx.execute(sql`UPDATE ispatla_app.automation_consents SET mode=${mode},policy_version=${input.policyVersion},consent_copy_version=${input.copyVersion},daily_limit=${input.dailyLimit},cadence_seconds=${input.cadenceSeconds},
       version=${version},granted_at=${grantedAt},revoked_at=${revokedAt},updated_at=${now} WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} AND action_type=${input.action} AND version=${input.expectedVersion}`) as unknown as RawResult;
    if (saved.rowCount !== 1) throw new Error("consent version conflict");
    return { action: input.action, mode: input.mode, version, policyVersion: input.policyVersion, copyVersion: input.copyVersion,
      dailyLimit: input.dailyLimit, cadenceSeconds: input.cadenceSeconds, grantedAt, revokedAt };
  });
}

export async function disconnectPostgresXAccount(input: { accountId: number; ownerUserId: string; now?: number }) {
  const now = nowSeconds(input.now);
  return getPostgresDb().transaction(async (tx) => {
    const account = await tx.execute(sql`SELECT 1 FROM ispatla_app.x_oauth_accounts WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} FOR UPDATE`) as unknown as RawResult;
    if (!account.rowCount) return false;
    await tx.execute(sql`UPDATE ispatla_app.x_oauth_credentials SET revoked_at=${now},encrypted_access_token='',encrypted_refresh_token='',
      token_version=token_version+1,refresh_lease_id=NULL,refresh_lease_until=0,updated_at=${now} WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId}`);
    await tx.execute(sql`UPDATE ispatla_app.x_oauth_accounts SET auth_state='revoked',last_auth_error='',last_health_at=${now} WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId}`);
    await tx.execute(sql`UPDATE ispatla_app.automation_consents SET mode=CASE WHEN mode='auto' THEN 'off' ELSE mode END,version=version+1,
      revoked_at=CASE WHEN mode='auto' THEN ${now} ELSE revoked_at END,updated_at=${now} WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId}`);
    return true;
  });
}

export async function markPostgresXAccountReauthorizationRequired(accountId: number, ownerUserId: string): Promise<boolean> {
  const now = nowSeconds();
  const changed = await getPostgresDb().transaction(async (tx) => {
    const changed = await tx.execute(sql`UPDATE ispatla_app.x_oauth_accounts SET auth_state='reauthorization_required',last_auth_error='reauth',last_health_at=${now}
      WHERE account_id=${accountId} AND owner_user_id=${ownerUserId}`) as unknown as RawResult;
    if (changed.rowCount) await tx.execute(sql`UPDATE ispatla_app.x_oauth_credentials SET token_version=token_version+1,refresh_lease_id=NULL,refresh_lease_until=0,updated_at=${now}
      WHERE account_id=${accountId} AND owner_user_id=${ownerUserId}`);
    return changed.rowCount ?? 0;
  });
  return changed === 1;
}

export async function withPostgresXTokenRefresh<T>(input: {
  accountId: number; ownerUserId: string; refresh: (refreshToken: string, current: PostgresXCredential) => Promise<{ accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] }>;
  now?: () => number; bufferSeconds?: number; waitMs?: number;
}, work: (credential: PostgresXCredential) => Promise<T>): Promise<T> {
  const now = input.now || (() => Math.floor(Date.now() / 1000));
  const buffer = input.bufferSeconds ?? 120;
  const waitMs = input.waitMs ?? 20;
  const requireConnected = (credential: PostgresXCredential | null) => {
    if (!credential || credential.revokedAt !== null || credential.authState === "revoked") throw new Error("𝕏 account is disconnected");
    if (credential.authState !== "connected") throw new Error("𝕏 account requires reauthorization");
    return credential;
  };
  const initial = requireConnected(await getPostgresXCredential(input.accountId,input.ownerUserId));
  if (initial.expiresAt > now() + buffer) return work(initial);
  const leaseId = randomUUID();
  const deadline = Date.now() + REFRESH_LEASE_SECONDS * 1000;
  while (Date.now() < deadline) {
    const claimed = await getPostgresDb().execute(sql`UPDATE ispatla_app.x_oauth_credentials SET refresh_lease_id=${leaseId},refresh_lease_until=${now()+REFRESH_LEASE_SECONDS}
      WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} AND revoked_at IS NULL
        AND access_expires_at <= ${now()+buffer} AND refresh_lease_until <= ${now()} RETURNING token_version`) as unknown as RawResult;
    if (!claimed.rowCount) {
      const latest = requireConnected(await getPostgresXCredential(input.accountId,input.ownerUserId));
      if (latest.expiresAt > now() + buffer) return work(latest);
      await new Promise((resolve) => setTimeout(resolve,waitMs));
      continue;
    }
    const current = requireConnected(await getPostgresXCredential(input.accountId,input.ownerUserId));
    try {
      const refreshed = await input.refresh(current.refreshToken,current);
      if (POSTGRES_X_OAUTH_SCOPES.some((scope) => !refreshed.scopes.includes(scope))) throw new Error("required 𝕏 permissions are missing");
      const access = seal(refreshed.accessToken), refresh = seal(refreshed.refreshToken);
      const saved = await getPostgresDb().execute(sql`UPDATE ispatla_app.x_oauth_credentials SET encrypted_access_token=${access.value},encrypted_refresh_token=${refresh.value},
        encryption_key_id=${access.keyId},access_expires_at=${refreshed.expiresAt},scopes=${sql.param([...new Set(refreshed.scopes)])}::text[],token_version=token_version+1,refreshed_at=${now()},updated_at=${now()},
        refresh_lease_id=NULL,refresh_lease_until=0 WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} AND token_version=${current.version} AND refresh_lease_id=${leaseId} AND revoked_at IS NULL`) as unknown as RawResult;
      if (saved.rowCount) await getPostgresDb().execute(sql`UPDATE ispatla_app.x_oauth_accounts SET auth_state='connected',last_auth_error='',last_health_at=${now()}
        WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} AND auth_state<>'revoked'`);
      else {
        const latest = requireConnected(await getPostgresXCredential(input.accountId,input.ownerUserId));
        if (latest.expiresAt <= now()+buffer) throw new Error("𝕏 token refresh lost its lease");
      }
    } catch (error) {
      const invalidGrant = /invalid_grant/i.test(error instanceof Error ? error.message : "");
      await getPostgresDb().transaction(async (tx) => {
        await tx.execute(sql`UPDATE ispatla_app.x_oauth_accounts SET auth_state=${invalidGrant?"reauthorization_required":"connected"},
          last_auth_error=${invalidGrant?"reauthorization_required":"refresh_failed"},last_health_at=${now()} WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId}
          AND EXISTS(SELECT 1 FROM ispatla_app.x_oauth_credentials WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} AND refresh_lease_id=${leaseId} AND revoked_at IS NULL)`);
        await tx.execute(sql`UPDATE ispatla_app.x_oauth_credentials SET refresh_lease_id=NULL,refresh_lease_until=0 WHERE account_id=${input.accountId} AND owner_user_id=${input.ownerUserId} AND refresh_lease_id=${leaseId} AND revoked_at IS NULL`);
      });
      throw error;
    }
    return work(requireConnected(await getPostgresXCredential(input.accountId,input.ownerUserId)));
  }
  throw new Error("𝕏 token refresh lease timed out");
}

export async function assertPostgresXAccountOwner(input: { xUserId: string; ownerUserId: string }): Promise<void> {
  if (!/^\d{1,32}$/.test(input.xUserId) || !input.ownerUserId.trim()) throw new Error("invalid 𝕏 identity");
  const result = await getPostgresDb().execute(sql`SELECT owner_user_id FROM ispatla_app.x_oauth_accounts WHERE x_user_id=${input.xUserId} LIMIT 1`) as unknown as RawResult;
  if (result.rows[0] && result.rows[0].owner_user_id !== input.ownerUserId) {
    throw new Error("𝕏 account is already connected to another user");
  }
}

export async function getPostgresOwnUserProfileXUserId(ownerUserId: string): Promise<string | null> {
  const result = await getPostgresDb().execute(sql`SELECT x_user_id FROM ispatla_app.user_profile_x_identity WHERE owner_user_id=${ownerUserId} LIMIT 1`) as unknown as RawResult;
  return result.rows[0]?.x_user_id ?? null;
}

export async function getPostgresXAccounts(ownerUserId: string) {
  const result = await getPostgresDb().execute(sql`SELECT account.id,account.handle,account.display_name,account.enabled,xgrant.auth_state,xgrant.x_user_id,credential.scopes,consent.mode AS post_mode
     FROM ispatla_app.accounts account
     LEFT JOIN ispatla_app.x_oauth_accounts xgrant ON xgrant.account_id=account.id AND xgrant.owner_user_id=account.owner_user_id
     LEFT JOIN ispatla_app.x_oauth_credentials credential ON credential.account_id=account.id AND credential.owner_user_id=account.owner_user_id AND credential.revoked_at IS NULL
     LEFT JOIN ispatla_app.automation_consents consent ON consent.account_id=account.id AND consent.owner_user_id=account.owner_user_id AND consent.action_type='post'
     WHERE account.owner_user_id=${ownerUserId} ORDER BY account.default_account DESC,account.handle`) as unknown as RawResult;
  return result.rows.map((row) => ({ id: Number(row.id), handle: row.handle, displayName: row.display_name,
    enabled: row.enabled, connected: row.auth_state === "connected" && row.scopes !== null, authState: row.auth_state || "disconnected",
    xUserId: row.x_user_id, scopes: row.scopes || [], postMode: row.post_mode === "shadow" ? "observe" : row.post_mode === "manual" ? "assist" : row.post_mode || "off" }));
}

export async function isPostgresXAccountConnectedAndProfileIdentity(accountId: number, ownerUserId: string): Promise<boolean> {
  const result = await getPostgresDb().execute(sql`SELECT 1 FROM ispatla_app.accounts account
     JOIN ispatla_app.x_oauth_accounts xgrant ON xgrant.account_id=account.id AND xgrant.owner_user_id=account.owner_user_id
     JOIN ispatla_app.x_oauth_credentials credential ON credential.account_id=account.id AND credential.owner_user_id=account.owner_user_id
     JOIN ispatla_app.user_profile_x_identity identity ON identity.owner_user_id=account.owner_user_id AND identity.x_user_id=xgrant.x_user_id
     WHERE account.id=${accountId} AND account.owner_user_id=${ownerUserId} AND account.enabled=TRUE AND xgrant.auth_state='connected' AND credential.revoked_at IS NULL LIMIT 1`) as unknown as RawResult;
  return result.rowCount === 1;
}

export const postgresXOAuthInternals = { hash, seal, open, tokenKeys, requiredScopes: POSTGRES_X_OAUTH_SCOPES, transactionTtlSeconds: TTL_SECONDS };
