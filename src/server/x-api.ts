// Official X API v2 client: OAuth 2.0 (PKCE, user context) plus Bearer tokens.
//
// The reader transports (FxTwitter) are read-only and need no credential, so
// this client is optional — but it is the only path that can publish, and the
// only one that returns engagement metrics the mirrors omit.
//
// Two authentication modes, both stored as secrets:
//
//   x_api_bearer        Application-only. Reads public timelines/search with a
//                       project bearer token. `users/me` is forbidden on this
//                       mode and posting is forbidden too, so every write path
//                       checks the mode first rather than discovering it from a
//                       403.
//   x_api_access_token  OAuth 2.0 user context with a refresh token. Required for
//                       posting, replying, liking and anything that acts as the
//                       account. Refreshed on demand; the new refresh token is
//                       written back so a rotation survives a restart.
//
// Credentials are read through the secrets table, never from the environment, so
// they stay inside the AES-256-GCM vault like the provider keys.

import { readSecret, saveSecret } from "./vault";

const API_BASE = "https://api.x.com";

export const X_BEARER_SECRET = "x_api_bearer";
export const X_ACCESS_SECRET = "x_api_access_token";
export const X_CLIENT_ID_SECRET = "x_api_client_id";
export const X_CLIENT_SECRET_SECRET = "x_api_client_secret";

export type XApiAuthMode = "bearer" | "oauth";

export type XApiCredentials = {
  mode: XApiAuthMode;
  bearer?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
  clientSecret?: string;
};

export type XApiConfigStatus = {
  mode: XApiAuthMode | null;
  configured: boolean;
  /** Bearer tokens cannot act as the account; OAuth can. */
  canPublish: boolean;
  canRead: boolean;
  accessTokenExpired: boolean;
  missing: string[];
};

export class XApiError extends Error {
  constructor(readonly status: number, readonly detail: string, readonly payload?: unknown) {
    super(`X API ${status}: ${detail}`);
    this.name = "XApiError";
  }
}

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

/**
 * The OAuth triple lives in one JSON secret so a rotation is atomic: writing the
 * access token and the rotated refresh token together cannot half-succeed the way
 * two independent writes would.
 */
export function loadXApiCredentials(): XApiCredentials {
  const oauthRaw = readSecret(X_ACCESS_SECRET);
  const bearer = readSecret(X_BEARER_SECRET)?.trim();
  const clientId = readSecret(X_CLIENT_ID_SECRET)?.trim();
  const clientSecret = readSecret(X_CLIENT_SECRET_SECRET)?.trim();

  if (oauthRaw) {
    try {
      const parsed = JSON.parse(oauthRaw) as Partial<XApiCredentials>;
      if (parsed.accessToken) {
        return {
          mode: "oauth",
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          expiresAt: parsed.expiresAt,
          clientId: clientId || parsed.clientId,
          clientSecret: clientSecret || parsed.clientSecret,
        };
      }
    } catch {
      // A malformed blob must not take down the reader: fall through to bearer.
    }
  }
  if (bearer) return { mode: "bearer", bearer };
  return { mode: "bearer" };
}

function storeOAuth(credentials: XApiCredentials): void {
  saveSecret(X_ACCESS_SECRET, "X API (OAuth 2.0)", JSON.stringify({
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  }));
}

export function xApiConfigStatus(): XApiConfigStatus {
  const credentials = loadXApiCredentials();
  const missing: string[] = [];
  if (credentials.mode === "oauth") {
    if (!credentials.accessToken) missing.push("access token");
    if (!credentials.refreshToken) missing.push("refresh token");
    if (!credentials.clientId) missing.push("client id");
    if (!credentials.clientSecret) missing.push("client secret");
  } else if (!credentials.bearer) {
    missing.push("bearer token");
  }
  const expired = credentials.mode === "oauth" && typeof credentials.expiresAt === "number"
    ? credentials.expiresAt * 1000 <= Date.now() + 60_000
    : false;
  return {
    mode: credentials.accessToken || credentials.bearer ? credentials.mode : null,
    configured: missing.length === 0,
    canPublish: credentials.mode === "oauth" && !expired,
    canRead: missing.length === 0,
    accessTokenExpired: expired,
    missing,
  };
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(buffer).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 48): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  // SubtleCrypto is async and this is only used during the authorize step.
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((digest) => base64url(digest));
}

// ---------------------------------------------------------------------------
// OAuth 2.0 authorization-code with PKCE
// ---------------------------------------------------------------------------

export type XAuthorizeStart = {
  authorizeUrl: string;
  codeVerifier: string;
  state: string;
};

export async function startXAuthorization(): Promise<XAuthorizeStart> {
  const credentials = loadXApiCredentials();
  const clientId = readSecret(X_CLIENT_ID_SECRET)?.trim() || credentials.clientId;
  if (!clientId) throw new Error("X API client id eksik");

  const codeVerifier = randomString(64);
  const state = randomString(24);
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", "https://x.com/i/oauth2/redirect");
  url.searchParams.set("scope", "tweet.read tweet.write users.read offline.access media.write");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", await sha256Base64Url(codeVerifier));
  return { authorizeUrl: url.toString(), codeVerifier, state };
}

export async function completeXAuthorization(input: { code: string; state: string; codeVerifier: string; expectedState: string }): Promise<XApiCredentials> {
  if (input.state !== input.expectedState) throw new Error("OAuth state eşleşmedi");
  const clientId = readSecret(X_CLIENT_ID_SECRET)?.trim();
  const clientSecret = readSecret(X_CLIENT_SECRET_SECRET)?.trim();
  if (!clientId || !clientSecret) throw new Error("X API client id/secret eksik");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: "https://x.com/i/oauth2/redirect",
    client_id: clientId,
    code_verifier: input.codeVerifier,
  });
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new XApiError(response.status, String(payload.detail || payload.title || "token exchange başarısız"), payload);
  }
  const credentials: XApiCredentials = {
    mode: "oauth",
    accessToken: String(payload.access_token || ""),
    refreshToken: String(payload.refresh_token || ""),
    expiresAt: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 7200),
    clientId,
    clientSecret,
  };
  storeOAuth(credentials);
  return credentials;
}

/**
 * Refresh the access token when it is within a minute of expiry. X rotates the
 * refresh token on every use, so the new one is persisted before the caller ever
 * sees the access token — losing that race would lock the account out until the
 * user re-authorised.
 */
export async function ensureXAccessToken(force = false): Promise<string | null> {
  const credentials = loadXApiCredentials();
  if (credentials.mode !== "oauth" || !credentials.accessToken) return credentials.bearer || null;
  const expiresAtMs = (credentials.expiresAt || 0) * 1000;
  if (!force && expiresAtMs > Date.now() + 60_000) return credentials.accessToken;
  if (!credentials.refreshToken || !credentials.clientId || !credentials.clientSecret) return credentials.accessToken;

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new XApiError(response.status, String(payload.detail || payload.title || "token yenileme başarısız"), payload);
  }
  const refreshed: XApiCredentials = {
    mode: "oauth",
    accessToken: String(payload.access_token || credentials.accessToken),
    // X may omit the refresh token on rotation; keeping the old one is safer
    // than storing undefined.
    refreshToken: String(payload.refresh_token || credentials.refreshToken),
    expiresAt: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 7200),
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  };
  storeOAuth(refreshed);
  return refreshed.accessToken || null;
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

async function authorizationHeader(forceRefresh = false): Promise<string | null> {
  const credentials = loadXApiCredentials();
  if (credentials.mode === "oauth") {
    const token = await ensureXAccessToken(forceRefresh);
    return token ? `Bearer ${token}` : null;
  }
  return credentials.bearer ? `Bearer ${credentials.bearer}` : null;
}

export async function xApiFetch(
  path: string,
  init: { method?: string; body?: unknown; search?: Record<string, string | number | undefined> } = {},
): Promise<unknown> {
  const authorization = await authorizationHeader();
  if (!authorization) throw new XApiError(401, "X API kimlik bilgisi yok");
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  for (const [key, value] of Object.entries(init.search || {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: init.method || "GET",
    headers: {
      authorization,
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String((payload as Record<string, unknown>).detail || (payload as Record<string, unknown>).title || response.statusText);
    throw new XApiError(response.status, detail, payload);
  }
  return payload;
}

/**
 * Verifies the stored credential end to end. `users/me` is the only endpoint
 * that distinguishes a live OAuth user token from a dead one, so OAuth mode is
 * probed with it and bearer mode with a public read instead — the bearer probe is
 * deliberately a different endpoint because `users/me` is application-only
 * forbidden and would report a healthy token as broken.
 */
export async function verifyXApiCredentials(): Promise<{ ok: boolean; mode: XApiAuthMode | null; identity: string; detail: string }> {
  const status = xApiConfigStatus();
  if (!status.configured) {
    return { ok: false, mode: status.mode, identity: "", detail: `eksik: ${status.missing.join(", ")}` };
  }
  try {
    if (status.mode === "oauth") {
      const payload = record(await xApiFetch("/2/users/me"));
      const data = record(payload.data);
      const username = String(payload.username || data.username || "?");
      return { ok: true, mode: "oauth", identity: `@${username}`, detail: "OAuth kullanıcı token'ı geçerli" };
    }
    const payload = record(await xApiFetch("/2/tweets", { search: { query: "from:x", max_results: 1 } }));
    const count = Array.isArray(payload.data) ? payload.data.length : 0;
    return { ok: true, mode: "bearer", identity: "app-only", detail: `Bearer geçerli (${count} sonuç)` };
  } catch (error) {
    return {
      ok: false,
      mode: status.mode,
      identity: "",
      detail: error instanceof XApiError ? error.detail : String(error),
    };
  }
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

export type XApiPost = {
  id: string;
  text: string;
  createdAt: string;
  handle?: string;
  metrics?: { likes?: number; reposts?: number; replies?: number; impressions?: number };
};

export async function xApiFetchPost(externalId: string): Promise<XApiPost> {
  const payload = record(await xApiFetch(`/2/tweets/${encodeURIComponent(externalId)}`, {
    search: { "tweet.fields": "created_at,public_metrics,author_id,conversation_id" },
  }));
  const data = record(payload.data);
  const metrics = record(data.public_metrics);
  return {
    id: String(data.id || externalId),
    text: String(data.text || ""),
    createdAt: String(data.created_at || ""),
    metrics: {
      likes: number(metrics.like_count),
      reposts: number(metrics.retweet_count),
      replies: number(metrics.reply_count),
      impressions: number(metrics.impression_count),
    },
  };
}

/**
 * Publishes a post. Throws on bearer mode with a message that names the fix,
 * because X answers that particular mistake with a 403 that reads like a quota
 * problem.
 */
export async function xApiPublishPost(text: string, options: { replyTo?: string } = {}): Promise<XApiPost> {
  const status = xApiConfigStatus();
  if (!status.canPublish) {
    throw new Error(
      status.mode === "bearer"
        ? "Yayınlamak için OAuth 2.0 user context token'ı gerekir (bearer token sadece okur)"
        : status.accessTokenExpired
          ? "OAuth access token süresi dolmuş ve yenilenemedi"
          : "X API OAuth kimlik bilgileri eksik",
    );
  }
  const body: Record<string, unknown> = { text };
  if (options.replyTo) {
    body.reply = { in_reply_to_tweet_id: options.replyTo };
  }
  const payload = record(await xApiFetch("/2/tweets", { method: "POST", body }));
  const data = record(payload.data);
  return {
    id: String(data.id || ""),
    text: String(data.text || text),
    createdAt: String(data.created_at || new Date().toISOString()),
  };
}

export async function xApiUserContext(): Promise<{ id: string; handle: string; name: string } | null> {
  if (xApiConfigStatus().mode !== "oauth") return null;
  try {
    const payload = record(await xApiFetch("/2/users/me"));
    return { id: String(payload.id || ""), handle: String(payload.username || ""), name: String(payload.name || "") };
  } catch {
    return null;
  }
}
