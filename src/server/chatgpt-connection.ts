import { createServer, type Server } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { currentOwnerId, runAsOwner } from "./owner-context";
import { getSecretCiphertext, getSetting, setSetting } from "./db";
import { readSecret, removeSecret, saveSecret, vaultReady } from "./vault";

const AUTH_ENDPOINT = "https://auth.openai.com/api/accounts/authorize";
const TOKEN_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/token";
const API_RESOURCE = "https://api.openai.com/v1";
const CALLBACK_PATH = "/auth/callback";
const CONNECTION_SECRET = "chatgpt_plan_usage";
const HOST_ID_SETTING = "chatgpt_plan_usage_ext_agent_host_id";
const REQUIRED_SCOPES = ["openid", "profile", "email", "offline_access", "resource.invoke", "chatgpt.tokens.use.direct"] as const;
const FLOW_TTL_MS = 5 * 60 * 1000;
const remoteJwks = createRemoteJWKSet(new URL("https://auth.openai.com/.well-known/jwks.json"), { timeoutDuration: 5_000 });

type Credential = {
  clientId: string;
  email: string | null;
  subject: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
};

type PendingFlow = {
  ownerId: string;
  state: string;
  nonce: string;
  verifier: string;
  callbackUri: string;
  clientId: string;
  priorSubject: string | null;
  generation: number;
  callbackAttempted: boolean;
  expiresAt: number;
  server: Server;
  timer: ReturnType<typeof setTimeout>;
};

const pendingByState = new Map<string, PendingFlow>();
const pendingStateByOwner = new Map<string, string>();
const refreshByOwner = new Map<string, Promise<string>>();
const generationByOwner = new Map<string, number>();
let hostIdPromise: Promise<string> | null = null;

export function isChatGPTFlowExpired(expiresAt: number, now = Date.now()): boolean {
  return !Number.isFinite(expiresAt) || now >= expiresAt;
}

function ownerId(): string {
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated profile owner required");
  return owner;
}

function generation(owner: string): number {
  return generationByOwner.get(owner) || 0;
}

function assertLocalPlanUsage(): void {
  if (process.env.NODE_ENV === "production") throw new Error("ChatGPT plan connections are not enabled for hosted production use");
}

function credentials(): Credential | null {
  ownerId();
  const raw = readSecret(CONNECTION_SECRET);
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<Credential>;
  if (typeof value.clientId !== "string" || typeof value.subject !== "string"
    || typeof value.idToken !== "string" || typeof value.accessToken !== "string"
    || typeof value.refreshToken !== "string" || typeof value.expiresAt !== "number"
    || !Array.isArray(value.scopes) || !value.scopes.every((scope) => typeof scope === "string")) {
    throw new Error("stored ChatGPT connection is invalid");
  }
  return {
    clientId: value.clientId,
    email: typeof value.email === "string" ? value.email : null,
    subject: value.subject,
    idToken: value.idToken,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
    scopes: value.scopes,
  };
}

function saveCredentials(value: Credential): void {
  saveSecret(CONNECTION_SECRET, "ChatGPT plan usage", JSON.stringify(value));
}

function assertScopes(scopes: string[]): void {
  if (REQUIRED_SCOPES.some((scope) => !scopes.includes(scope))) throw new Error("ChatGPT authorization did not grant all required permissions");
}

function safeClientId(value: string): boolean {
  return /^[A-Za-z0-9._-]{8,200}$/.test(value) && value !== "dynamic_agent_client";
}

function randomValue(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1" || (isIP(normalized) === 4 && normalized.startsWith("127."))
    || normalized === "::1";
}

export function chatGPTAuthorizationUrl(input: {
  clientId: string;
  callbackUri: string;
  hostId: string;
  state: string;
  nonce: string;
  verifier: string;
  priorIdToken?: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  const values: Record<string, string> = {
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.callbackUri,
    scope: REQUIRED_SCOPES.join(" "),
    resource: API_RESOURCE,
    state: input.state,
    nonce: input.nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(input.verifier).digest("base64url"),
    ext_agent_host_id: input.hostId,
  };
  if (input.clientId === "dynamic_agent_client") values.agent_name_hint = "Ispatla";
  if (input.priorIdToken) values.id_token_hint = input.priorIdToken;
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return url.toString();
}

export async function verifyChatGPTIdToken(
  idToken: string,
  options: { clientId: string; nonce: string; jwks?: JWTVerifyGetKey },
): Promise<{ subject: string; email: string | null }> {
  const { payload } = await jwtVerify(idToken, options.jwks || remoteJwks, {
    issuer: "https://auth.openai.com",
    audience: options.clientId,
    requiredClaims: ["sub", "exp", "iat"],
    clockTolerance: 5,
  });
  if (payload.nonce !== options.nonce || typeof payload.sub !== "string" || !payload.sub) throw new Error("ChatGPT identity validation failed");
  return { subject: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
}

async function hostId(): Promise<string> {
  if (!hostIdPromise) {
    const pending = Promise.resolve().then(() => {
      const saved = runAsOwner("system:chatgpt-plan-usage", () => getSetting(HOST_ID_SETTING));
      if (saved.startsWith("urn:uuid:")) return saved;
      const next = `urn:uuid:${randomUUID()}`;
      runAsOwner("system:chatgpt-plan-usage", () => setSetting(HOST_ID_SETTING, next, Math.floor(Date.now() / 1000)));
      return next;
    });
    hostIdPromise = pending.catch((error) => {
      hostIdPromise = null;
      throw error;
    });
  }
  return hostIdPromise;
}

function finishFlow(state: string, flow: PendingFlow): void {
  clearTimeout(flow.timer);
  pendingByState.delete(state);
  if (pendingStateByOwner.get(flow.ownerId) === state) pendingStateByOwner.delete(flow.ownerId);
  flow.server.close();
}

function htmlResponse(ok: boolean): { status: number; html: string } {
  const heading = ok ? "ChatGPT account connected" : "ChatGPT connection was not completed";
  const detail = ok ? "You can close this tab and return to Ispatla." : "Return to Ispatla and try connecting again.";
  return { status: ok ? 200 : 400, html: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${heading}</title><body><main><h1>${heading}</h1><p>${detail}</p></main></body></html>` };
}

async function completeCallback(flow: PendingFlow, url: URL): Promise<void> {
  const param = (name: string) => {
    const values = url.searchParams.getAll(name);
    if (values.length > 1) throw new Error("OAuth callback has duplicate parameters");
    return values[0] || "";
  };
  if (isChatGPTFlowExpired(flow.expiresAt) || param("state") !== flow.state) throw new Error("OAuth transaction expired or state did not match");
  if (param("error")) throw new Error(param("error") === "access_denied" ? "ChatGPT authorization was declined" : "ChatGPT authorization failed");
  const code = param("code");
  const issuedClientId = param("client_id");
  const clientId = flow.clientId === "dynamic_agent_client" ? issuedClientId : flow.clientId;
  if (!code || !safeClientId(clientId) || (issuedClientId && issuedClientId !== clientId)) throw new Error("ChatGPT registration response was invalid");

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: flow.verifier, redirect_uri: flow.callbackUri, client_id: clientId, resource: API_RESOURCE }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenBody = await tokenResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!tokenResponse.ok || !tokenBody || typeof tokenBody.access_token !== "string" || typeof tokenBody.refresh_token !== "string"
    || typeof tokenBody.id_token !== "string" || typeof tokenBody.expires_in !== "number" || !Number.isFinite(tokenBody.expires_in)
    || tokenBody.expires_in < 60 || tokenBody.expires_in > 86_400) throw new Error("ChatGPT token exchange failed");
  const expiresIn = tokenBody.expires_in as number;
  const scopes = typeof tokenBody.scope === "string" ? tokenBody.scope.split(/\s+/).filter(Boolean) : [];
  assertScopes(scopes);
  const identity = await verifyChatGPTIdToken(tokenBody.id_token, { clientId, nonce: flow.nonce });
  if (flow.priorSubject && identity.subject !== flow.priorSubject) throw new Error("The ChatGPT account did not match the connected account");
  if (generation(flow.ownerId) !== flow.generation) throw new Error("ChatGPT connection was disconnected before authorization finished");
  runAsOwner(flow.ownerId, () => saveCredentials({
    clientId,
    email: identity.email,
    subject: identity.subject,
    idToken: tokenBody.id_token as string,
    accessToken: tokenBody.access_token as string,
    refreshToken: tokenBody.refresh_token as string,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes,
  }));
}

export async function beginChatGPTConnection(hostname: string): Promise<{ authorizationUrl: string; expiresAt: number }> {
  if (process.env.NODE_ENV === "production" || !isLoopbackHost(hostname)) throw new Error("ChatGPT plan connection is available only from a local development host");
  if (!vaultReady()) throw new Error("ISPATLA_SECRET_KEY must be configured before connecting ChatGPT");
  const userId = ownerId();
  if (pendingStateByOwner.has(userId)) throw new Error("A ChatGPT connection is already waiting for authorization");
  const saved = credentials();
  const flowGeneration = generation(userId);
  const state = randomValue();
  const starting = `starting:${state}`;
  pendingStateByOwner.set(userId, starting);
  let stableHostId: string;
  try { stableHostId = await hostId(); }
  catch (error) {
    if (pendingStateByOwner.get(userId) === starting) pendingStateByOwner.delete(userId);
    throw error;
  }
  const nonce = randomValue();
  const verifier = randomValue(48);
  const flowRef: { current?: PendingFlow } = {};
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      response.writeHead(404, { "cache-control": "no-store" }).end("Not found");
      return;
    }
    const flow = flowRef.current;
    if (!flow) {
      response.writeHead(503, { "cache-control": "no-store" }).end("OAuth listener is not ready");
      return;
    }
    const flowState = url.searchParams.get("state") || "";
    if (flowState !== flow.state || pendingByState.get(flow.state) !== flow) {
      response.writeHead(400, { "cache-control": "no-store" }).end("Invalid or expired OAuth state");
      return;
    }
    if (flow.callbackAttempted) {
      response.writeHead(409, { "cache-control": "no-store" }).end("OAuth callback already received");
      return;
    }
    flow.callbackAttempted = true;
    void completeCallback(flow, url).then(() => {
      const page = htmlResponse(true);
      response.writeHead(page.status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" }).end(page.html);
      finishFlow(flow.state, flow);
    }).catch(() => {
      const page = htmlResponse(false);
      response.writeHead(page.status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" }).end(page.html);
      finishFlow(flow.state, flow);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  }).catch((error: unknown) => {
    server.close();
    if (pendingStateByOwner.get(userId) === starting) pendingStateByOwner.delete(userId);
    throw error;
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    if (pendingStateByOwner.get(userId) === starting) pendingStateByOwner.delete(userId);
    throw new Error("ChatGPT loopback listener failed to start");
  }
  const callbackUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
  const expiresAt = Date.now() + FLOW_TTL_MS;
  const flow: PendingFlow = {
    ownerId: userId,
    state,
    nonce,
    verifier,
    callbackUri,
    clientId: saved?.clientId || "dynamic_agent_client",
    priorSubject: saved?.subject || null,
    generation: flowGeneration,
    callbackAttempted: false,
    expiresAt,
    server,
    timer: setTimeout(() => finishFlow(state, flow), FLOW_TTL_MS),
  };
  flowRef.current = flow;
  flow.timer.unref();
  if (generation(userId) !== flowGeneration || pendingStateByOwner.get(userId) !== starting) {
    clearTimeout(flow.timer);
    server.close();
    if (pendingStateByOwner.get(userId) === starting) pendingStateByOwner.delete(userId);
    throw new Error("ChatGPT connection was disconnected before authorization started");
  }
  pendingByState.set(state, flow);
  pendingStateByOwner.set(userId, state);
  return { authorizationUrl: chatGPTAuthorizationUrl({ clientId: flow.clientId, callbackUri, hostId: stableHostId, state, nonce, verifier, priorIdToken: saved?.idToken }), expiresAt };
}

export function getChatGPTConnectionStatus(): { connected: boolean; email: string | null; expiresAt: number | null; scopes: string[] } {
  const value = credentials();
  if (!value) return { connected: false, email: null, expiresAt: null, scopes: [] };
  return { connected: true, email: value.email, expiresAt: value.expiresAt, scopes: value.scopes };
}

async function refreshCredentials(userId: string): Promise<string> {
  assertLocalPlanUsage();
  const requestGeneration = generation(userId);
  const current = runAsOwner(userId, credentials);
  if (!current) throw new Error("ChatGPT account is not connected");
  assertScopes(current.scopes);
  if (current.expiresAt > Date.now() + 60_000) return current.accessToken;
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: current.clientId, refresh_token: current.refreshToken, resource: API_RESOURCE }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenBody = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !tokenBody || typeof tokenBody.access_token !== "string" || typeof tokenBody.refresh_token !== "string"
    || typeof tokenBody.expires_in !== "number" || !Number.isFinite(tokenBody.expires_in) || tokenBody.expires_in < 60 || tokenBody.expires_in > 86_400) {
    if (response.status === 400 && tokenBody?.error === "invalid_grant" && generation(userId) === requestGeneration) runAsOwner(userId, () => removeSecret(CONNECTION_SECRET));
    throw new Error("ChatGPT access token refresh failed");
  }
  const expiresIn = tokenBody.expires_in as number;
  const scopes = typeof tokenBody.scope === "string" ? tokenBody.scope.split(/\s+/).filter(Boolean) : current.scopes;
  assertScopes(scopes);
  if (generation(userId) !== requestGeneration) throw new Error("ChatGPT connection was disconnected while refreshing credentials");
  const next = { ...current, accessToken: tokenBody.access_token, refreshToken: tokenBody.refresh_token, expiresAt: Date.now() + expiresIn * 1000, scopes };
  runAsOwner(userId, () => saveCredentials(next));
  if (generation(userId) !== requestGeneration) throw new Error("ChatGPT connection was disconnected while refreshing credentials");
  return next.accessToken;
}

export async function getChatGPTAccessToken(): Promise<string> {
  const userId = ownerId();
  const existing = refreshByOwner.get(userId);
  if (existing) return existing;
  const refresh = refreshCredentials(userId);
  refreshByOwner.set(userId, refresh);
  try { return await refresh; }
  finally { if (refreshByOwner.get(userId) === refresh) refreshByOwner.delete(userId); }
}

/** Server-only context for direct Responses API calls; never serialize this to a browser. */
export async function getChatGPTPlanContext(): Promise<{ accessToken: string; hostId: string; scopes: readonly string[] }> {
  assertLocalPlanUsage();
  const userId = ownerId();
  const requestGeneration = generation(userId);
  const value = credentials();
  if (!value) throw new Error("ChatGPT account is not connected");
  assertScopes(value.scopes);
  const accessToken = await getChatGPTAccessToken();
  const stableHostId = await hostId();
  if (generation(userId) !== requestGeneration) throw new Error("ChatGPT connection was disconnected while preparing the request");
  const current = runAsOwner(userId, credentials);
  if (!current) throw new Error("ChatGPT account is not connected");
  assertScopes(current.scopes);
  return { accessToken, hostId: stableHostId, scopes: current.scopes };
}

/** Opaque owner-scoped fingerprint for invalidating model capability checks after reconnect. */
export function getChatGPTCredentialFingerprint(): string | null {
  const value = credentials();
  return value ? createHash("sha256").update(`${value.clientId}\0${value.subject}\0${value.idToken}`).digest("hex") : null;
}

export async function disconnectChatGPT(): Promise<{ revoked: boolean }> {
  const userId = ownerId();
  generationByOwner.set(userId, generation(userId) + 1);
  const pendingState = pendingStateByOwner.get(userId);
  const pendingFlow = pendingState ? pendingByState.get(pendingState) : undefined;
  if (pendingFlow) finishFlow(pendingFlow.state, pendingFlow);
  const hadStoredCredentials = Boolean(runAsOwner(userId, () => getSecretCiphertext(CONNECTION_SECRET)));
  let value: Credential | null = null;
  try { value = runAsOwner(userId, credentials); } catch { /* Clear malformed local state as well. */ }
  runAsOwner(userId, () => removeSecret(CONNECTION_SECRET));
  if (!value) return { revoked: !hadStoredCredentials };
  let revoked = false;
  try {
    const discovery = await fetch("https://auth.openai.com/.well-known/openid-configuration", { signal: AbortSignal.timeout(5_000) });
    const document = await discovery.json() as { revocation_endpoint?: unknown };
    if (discovery.ok && document.revocation_endpoint === "https://auth.openai.com/api/accounts/oauth/revoke") {
      const response = await fetch(document.revocation_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: value.refreshToken, token_type_hint: "refresh_token", client_id: value.clientId }),
        signal: AbortSignal.timeout(5_000),
      });
      revoked = response.status === 200;
    }
  } catch { /* Tokens are still cleared locally; callers report an unconfirmed remote revoke. */ }
  return { revoked };
}
