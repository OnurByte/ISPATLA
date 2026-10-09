import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readSecret, removeSecret, saveSecret, secretOrEnv } from "./vault";

const PENDING_SECRET = "openrouter_oauth_pending";
const API_KEY_SECRET = "openrouter_api_key";
const GENERATION_SECRET = "openrouter_oauth_generation";
const FLOW_TTL_MS = 10 * 60 * 1000;
const OPENROUTER_AUTH = "https://openrouter.ai/auth";
const OPENROUTER_EXCHANGE = "https://openrouter.ai/api/v1/auth/keys";
type OAuthFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type PendingFlow = { state: string; verifier: string; callbackUrl: string; expiresAt: number; generation: string };
function b64url(value: Buffer): string { return value.toString("base64url"); }
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function beginOpenRouterOAuth(callbackUrl: string, now = Date.now()): string {
  const callback = new URL(callbackUrl);
  if (callback.protocol !== "https:" && callback.hostname !== "localhost") throw new Error("secure_callback_required");
  const state = b64url(randomBytes(32));
  const verifier = b64url(randomBytes(48));
  const generation = b64url(randomBytes(24));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const flow: PendingFlow = { state, verifier, callbackUrl: callback.toString(), expiresAt: now + FLOW_TTL_MS, generation };
  saveSecret(GENERATION_SECRET, "OpenRouter connection", generation);
  saveSecret(PENDING_SECRET, "OpenRouter connection", JSON.stringify(flow));
  const url = new URL(OPENROUTER_AUTH);
  url.searchParams.set("callback_url", flow.callbackUrl);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("key_label", "Ispatla");
  return url.toString();
}

function takePendingFlow(state: string, callbackUrl: string, now = Date.now()): PendingFlow | null {
  let flow: PendingFlow | null = null;
  try {
    const raw = secretOrEnv(PENDING_SECRET, "");
    const parsed = raw ? JSON.parse(raw) as Partial<PendingFlow> : null;
    if (parsed && typeof parsed.state === "string" && typeof parsed.verifier === "string" && typeof parsed.callbackUrl === "string" && typeof parsed.expiresAt === "number" && typeof parsed.generation === "string") {
      flow = parsed as PendingFlow;
    }
  } catch { flow = null; }
  // Ignore unrelated state values without allowing them to cancel a valid flow.
  if (!flow || !equal(flow.state, state)) return null;
  // A matching state is single-use, even when expired or sent to another callback.
  removeSecret(PENDING_SECRET);
  if (flow.expiresAt < now || flow.callbackUrl !== callbackUrl) return null;
  return flow;
}

export async function finishOpenRouterOAuth(input: { state: string; code: string; callbackUrl: string; fetcher?: OAuthFetch; now?: number }): Promise<void> {
  if (!input.state || input.state.length > 200 || !input.code || input.code.length > 4096) throw new Error("invalid_callback");
  const flow = takePendingFlow(input.state, input.callbackUrl, input.now);
  if (!flow) throw new Error("invalid_or_expired_callback");
  const response = await (input.fetcher || fetch)(OPENROUTER_EXCHANGE, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: input.code, code_verifier: flow.verifier, code_challenge_method: "S256" }),
  });
  if (!response.ok) throw new Error("exchange_failed");
  const body = await response.json() as { key?: unknown };
  if (typeof body.key !== "string" || body.key.length < 16 || body.key.length > 4096) throw new Error("invalid_exchange_response");
  if (readSecret(GENERATION_SECRET) !== flow.generation) throw new Error("connection_cancelled");
  saveSecret(API_KEY_SECRET, "OpenRouter", body.key);
}

export function openRouterConnected(): boolean { return Boolean(secretOrEnv(API_KEY_SECRET, "OPENROUTER_API_KEY")); }
export function disconnectOpenRouter(): void { removeSecret(API_KEY_SECRET); removeSecret(PENDING_SECRET); removeSecret(GENERATION_SECRET); }
export const OPENROUTER_MODEL_SUGGESTIONS = ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash", "deepseek/deepseek-chat-v3-0324"] as const;
