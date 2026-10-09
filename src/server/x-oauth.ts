import { createHash } from "node:crypto";
import {
  connectXAccount, consumeOAuthTransaction, createOAuthTransaction, getXCredential,
  getXAccountAuthState, setAutomationConsent, disconnectXAccount, withXTokenRefresh,
} from "./x-oauth-store";
import type { XCredential } from "./x-oauth-store";
import { cacheSelectedProfileAvatar } from "./profile-avatar";

export const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"] as const;
const AUTHORIZATION_ENDPOINT = "https://x.com/i/oauth2/authorize";
const TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const ME_ENDPOINT = "https://api.x.com/2/users/me?user.fields=name,username,description,profile_image_url";

type Fetcher = typeof fetch;
type Environment = Record<string, string | undefined>;
const HTTP_TIMEOUT_MS = 10_000;

function providerFetch(fetcher: Fetcher, url: string, init: RequestInit): Promise<Response> {
  return fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
}

function oauthConfig(env: Environment) {
  if(env.ISPATLA_DEMO === "1") throw new Error("𝕏 OAuth is disabled in demo mode");
  const clientId = env.X_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("𝕏 OAuth is not configured");
  const redirectUri = env.X_OAUTH_REDIRECT_URI;
  if (!redirectUri) throw new Error("X_OAUTH_REDIRECT_URI must be configured");
  let parsed: URL;
  try { parsed = new URL(redirectUri); } catch { throw new Error("𝕏 OAuth callback must be an absolute URL"); }
  const production = env.NODE_ENV === "production";
  if (parsed.pathname !== "/api/x/oauth/callback" || parsed.search || parsed.hash || parsed.username || parsed.password
    || (production && parsed.protocol !== "https:") || (!production && !["https:", "http:"].includes(parsed.protocol))) {
    throw new Error("𝕏 OAuth callback URL is not allowed");
  }
  const clientSecret = env.X_OAUTH_CLIENT_SECRET;
  if (production && !clientSecret) throw new Error("X_OAUTH_CLIENT_SECRET must be configured in production");
  return { clientId, clientSecret, redirectUri };
}

function returnPath(value: string | undefined): string {
  if (!value) return "/app/accounts";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) throw new Error("OAuth return path is not allowed");
  const url = new URL(value, "https://ispatla.invalid");
  if (url.origin !== "https://ispatla.invalid" || !["/app/accounts", "/app/settings"].includes(url.pathname)) {
    throw new Error("OAuth return path is not allowed");
  }
  return `${url.pathname}${url.search}`;
}

export async function startXOAuth(input: {
  ownerUserId: string; sessionId: string; returnTo?: string; now?: number; databasePath?: string;
  env?: Environment; fetcher?: Fetcher;
}): Promise<{ authorizationUrl: string; expiresAt: number }> {
  if (!input.ownerUserId.trim() || !input.sessionId.trim()) throw new Error("authenticated app session required");
  const env = input.env || process.env;
  const config = oauthConfig(env);
  const transaction = createOAuthTransaction({ ownerUserId: input.ownerUserId, sessionId: input.sessionId,
    returnTo: returnPath(input.returnTo), now: input.now, databasePath: input.databasePath });
  const challenge = createHash("sha256").update(transaction.codeVerifier).digest("base64url");
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri,
    scope: X_OAUTH_SCOPES.join(" "), state: transaction.state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return { authorizationUrl: url.toString(), expiresAt: transaction.expiresAt };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    // Keep provider payloads and token details out of logs and caller-facing errors.
    const code = typeof body.error === "string" && body.error === "invalid_grant" ? "invalid_grant" : "provider_error";
    throw new Error(code);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export async function completeXOAuth(input: {
  request: Request; ownerUserId: string; sessionId: string; now?: number; databasePath?: string;
  env?: Environment; fetcher?: Fetcher;
}): Promise<{ accountId: number; handle: string; displayName: string; returnTo: string }> {
  if (!input.ownerUserId.trim() || !input.sessionId.trim()) throw new Error("authenticated app session required");
  const env = input.env || process.env;
  const config = oauthConfig(env);
  const url = new URL(input.request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!state || !code || code.length > 2048 || state.length > 500) throw new Error("invalid OAuth callback");
  if (url.searchParams.has("error")) throw new Error("𝕏 authorization was not completed");
  const transaction = consumeOAuthTransaction({ state, ownerUserId: input.ownerUserId, sessionId: input.sessionId,
    now: input.now, databasePath: input.databasePath });
  if (!transaction) throw new Error("OAuth transaction expired or already used");
  const fetcher = input.fetcher || fetch;
  const tokenHeaders = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
  if (config.clientSecret) tokenHeaders.set("authorization", `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`);
  const tokenBody = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri,
    code_verifier: transaction.codeVerifier });
  if (!config.clientSecret) tokenBody.set("client_id", config.clientId);
  const tokenData = await readJson(await providerFetch(fetcher, TOKEN_ENDPOINT, { method: "POST", headers: tokenHeaders, body: tokenBody }));
  const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";
  const refreshToken = typeof tokenData.refresh_token === "string" ? tokenData.refresh_token : "";
  const expiresIn = Number(tokenData.expires_in);
  const scopes = typeof tokenData.scope === "string" ? tokenData.scope.split(/\s+/).filter(Boolean) : [];
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn < 1) throw new Error("𝕏 did not issue a renewable account grant");
  const missing = X_OAUTH_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missing.length) throw new Error("required 𝕏 permissions are missing");
  const meData = await readJson(await providerFetch(fetcher, ME_ENDPOINT, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } }));
  const user = meData.data as Record<string, unknown> | undefined;
  if (!user || typeof user.id !== "string" || typeof user.username !== "string") throw new Error("𝕏 identity response is invalid");
  const bio = typeof user.description === "string" ? user.description : "";
  const displayName = typeof user.name === "string" ? user.name : user.username;
  const connected = connectXAccount({ ownerUserId: input.ownerUserId, xUserId: user.id, handle: user.username,
    displayName, bio, avatarUrl: null, accessToken, refreshToken,
    expiresAt: (input.now ?? Math.floor(Date.now() / 1000)) + expiresIn, scopes, now: input.now, databasePath: input.databasePath });
  if (typeof user.profile_image_url === "string") {
    try { await cacheSelectedProfileAvatar({ ownerUserId: input.ownerUserId,
      xUserId: user.id, handle: user.username, displayName, bio, avatarUrl: user.profile_image_url, fetcher, databasePath: input.databasePath }); }
    catch { /* The image is optional after the account grant has been stored. */ }
  }
  return { ...connected, returnTo: transaction.returnTo };
}

export async function refreshXToken<T>(input: {
  accountId: number; ownerUserId: string; now?: () => number; databasePath?: string; env?: Environment; fetcher?: Fetcher;
  bufferSeconds?: number;
}, work: (credential: XCredential) => Promise<T>): Promise<T> {
  const env = input.env || process.env;
  const config = oauthConfig(env);
  const fetcher = input.fetcher || fetch;
  return withXTokenRefresh({ ...input, refresh: async (refreshToken, current) => {
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
    if (config.clientSecret) headers.set("authorization", `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`);
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
    if (!config.clientSecret) body.set("client_id", config.clientId);
    const data = await readJson(await providerFetch(fetcher, TOKEN_ENDPOINT, { method: "POST", headers, body }));
    const accessToken = typeof data.access_token === "string" ? data.access_token : "";
    const rotatedRefreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";
    const expiresIn = Number(data.expires_in);
    const scopes = typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : current.scopes;
    if (!accessToken || !rotatedRefreshToken || !Number.isFinite(expiresIn) || expiresIn < 1) throw new Error("𝕏 token refresh failed");
    return { accessToken, refreshToken: rotatedRefreshToken, expiresAt: (input.now?.() ?? Math.floor(Date.now() / 1000)) + expiresIn, scopes };
  } }, work);
}

/** Revoke locally first so workers stop using credentials even if X is unavailable. */
export async function revokeXAccount(input: { accountId: number; ownerUserId: string; now?: number; databasePath?: string;
  env?: Environment; fetcher?: Fetcher }): Promise<{ disconnected: boolean; providerRevoked: boolean }> {
  let refreshToken: string | undefined;
  try { refreshToken = getXCredential(input.accountId, input.ownerUserId, input.databasePath)?.refreshToken || undefined; } catch { /* Local fencing must still work if decryption config is unavailable. */ }
  const disconnected = disconnectXAccount(input);
  if (!disconnected || !refreshToken) return { disconnected, providerRevoked: false };
  try {
    const env = input.env || process.env;
    const config = oauthConfig(env);
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
    const body = new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" });
    if (config.clientSecret) headers.set("authorization", `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`);
    else body.set("client_id", config.clientId);
    const response = await providerFetch(input.fetcher || fetch, "https://api.x.com/2/oauth2/revoke", { method: "POST", headers, body });
    return { disconnected, providerRevoked: response.ok };
  } catch {
    return { disconnected, providerRevoked: false };
  }
}

export { disconnectXAccount, getXAccountAuthState, getXCredential, setAutomationConsent };
