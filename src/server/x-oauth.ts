import {
  completePostgresXOAuth, startPostgresXOAuth, getPostgresXCredential, getPostgresXAccountAuthState,
  setPostgresAutomationConsent, disconnectPostgresXAccount, withPostgresXTokenRefresh,
  markPostgresXAccountReauthorizationRequired,
  type PostgresXCredential,
} from "./postgres-x-oauth";

export const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"] as const;
const TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";

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

export async function startXOAuth(input: {
  ownerUserId: string; sessionId: string; returnTo?: string; now?: number;
  env?: Environment; fetcher?: Fetcher;
}): Promise<{ authorizationUrl: string; expiresAt: number }> {
  if (!input.ownerUserId.trim() || !input.sessionId.trim()) throw new Error("authenticated app session required");
  return startPostgresXOAuth(input);
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
  request: Request; ownerUserId: string; sessionId: string; now?: number;
  env?: Environment; fetcher?: Fetcher;
}): Promise<{ accountId: number; handle: string; displayName: string; returnTo: string }> {
  if (!input.ownerUserId.trim() || !input.sessionId.trim()) throw new Error("authenticated app session required");
  return completePostgresXOAuth(input);
}

export async function refreshXToken<T>(input: {
  accountId: number; ownerUserId: string; now?: () => number; env?: Environment; fetcher?: Fetcher;
  bufferSeconds?: number;
}, work: (credential: PostgresXCredential) => Promise<T>): Promise<T> {
  const env = input.env || process.env;
  const config = oauthConfig(env);
  const fetcher = input.fetcher || fetch;
  return withPostgresXTokenRefresh({ ...input, refresh: async (refreshToken, current) => {
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
export async function revokeXAccount(input: { accountId: number; ownerUserId: string; now?: number;
  env?: Environment; fetcher?: Fetcher }): Promise<{ disconnected: boolean; providerRevoked: boolean }> {
  let refreshToken: string | undefined;
  try { refreshToken = (await getPostgresXCredential(input.accountId, input.ownerUserId))?.refreshToken || undefined; } catch { /* Local fencing must still work if decryption config is unavailable. */ }
  const disconnected = await disconnectPostgresXAccount(input);
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

export const getXAccountAuthState = getPostgresXAccountAuthState;
export const getXCredential = getPostgresXCredential;
export const setAutomationConsent = setPostgresAutomationConsent;
export const disconnectXAccount = disconnectPostgresXAccount;
export const markXAccountReauthorizationRequired = markPostgresXAccountReauthorizationRequired;
