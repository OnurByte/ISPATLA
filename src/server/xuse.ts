import { spawn, spawnSync } from "node:child_process";
import { getAccounts, getSetting, recordAccountSubscriptionSync, setSetting, SUBSCRIPTION_TIERS, type Account, type SubscriptionTier } from "./db";
import { ensureXUseSettings, syncXUseAccounts, xuseConfigStatus } from "./xuse-config";

export const X_USE_ACTIONS = ["post", "quote", "reply", "thread", "dm", "engage"] as const;
export type XUseAction = (typeof X_USE_ACTIONS)[number];

export type XUseCapability = {
  available: boolean;
  bin: string;
  help: string;
  actions: Record<XUseAction, boolean>;
  config: ReturnType<typeof xuseConfigStatus>;
  doctor: "ok" | "failed" | "unavailable";
  reason?: string;
};

export type XUseJobResult = {
  ok: boolean;
  receipt: string;
  queueId?: string;
  remoteUrl?: string;
  reason?: string;
  xuseStatus?: string;
};

export type XUseInspectResult = { account: string; kind: "tweet" | "profile" | "search"; items: Array<Record<string, unknown>> };
export type XUseAccountHealth = { config: Record<string, unknown>; cookies: Record<string, unknown>; session: Record<string, unknown>; queue: Record<string, unknown>; drafts: Record<string, unknown>; metrics: Record<string, unknown> };
export type XUseLoggedAccount = { id: number; handle: string; displayName: string; xuseAccountId: string; health: XUseAccountHealth };

export type XUseSubscription = {
  handle: string;
  tier: SubscriptionTier;
  observedAt: number;
  history: Array<{ tier: SubscriptionTier; effectiveAt: number }>;
  historyComplete: boolean;
};

export type XUseSubscriptionSyncResult = { ok: boolean; subscription?: XUseSubscription; reason?: string };

function normalisePostText(value: string): string {
  return value.replace(/[\u200b\u200c\u200d]/g, "").replace(/\s+/g, " ").trim();
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function subscriptionTier(value: unknown): SubscriptionTier {
  const normalized = string(value).toLocaleLowerCase("en-US").replaceAll("+", "_plus").replace(/[\s-]+/g, "_");
  return SUBSCRIPTION_TIERS.includes(normalized as SubscriptionTier) ? normalized as SubscriptionTier : "unknown";
}

export function normaliseXUseSubscription(value: unknown, now = Math.floor(Date.now() / 1000)): XUseSubscription | null {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const observedAt = Math.min(now, Math.max(1, Math.floor(Number(payload.observed_at || payload.observedAt || now)) || now));
  const rawHistory = Array.isArray(payload.history) ? payload.history : Array.isArray(payload.events) ? payload.events : [];
  const history = rawHistory.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).map((item) => ({
    tier: subscriptionTier(item.tier || item.subscription_tier),
    effectiveAt: Math.floor(Number(item.effective_at || item.effectiveAt || item.started_at || item.startedAt)),
  })).filter((event) => event.tier !== "unknown" && Number.isInteger(event.effectiveAt) && event.effectiveAt > 0 && event.effectiveAt <= observedAt)
    .sort((left, right) => left.effectiveAt - right.effectiveAt);
  const unique = history.filter((event, index) => index === 0 || event.effectiveAt !== history[index - 1].effectiveAt);
  const tier = subscriptionTier(payload.tier || payload.current_tier || payload.currentTier);
  if (tier === "unknown" && !unique.length) return null;
  return {
    handle: string(payload.handle || payload.username || payload.screen_name || payload.screenName).replace(/^@/, "").toLowerCase(),
    tier: tier === "unknown" ? unique.at(-1)?.tier || "unknown" : tier,
    observedAt,
    history: unique,
    historyComplete: payload.history_complete === true || payload.historyComplete === true,
  };
}

function commandAvailable(bin: string): boolean {
  const result = bin.includes("/")
    ? spawnSync("test", ["-x", bin], { encoding: "utf8" })
    : spawnSync("sh", ["-c", "command -v -- \"$1\"", "ispatla", bin], { encoding: "utf8" });
  return result.error == null && result.status === 0;
}

function emptyActions(): Record<XUseAction, boolean> {
  return { post: false, quote: false, reply: false, thread: false, dm: false, engage: false };
}

export function xuseEnvironment(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (
      key === "HOME" || key === "PATH" || key === "TMPDIR" || key === "TMP" || key === "TEMP" ||
      key === "LANG" || key.startsWith("LC_") || key === "HTTP_PROXY" || key === "HTTPS_PROXY" ||
      key === "ALL_PROXY" || key === "NO_PROXY" || key.startsWith("XUSE_")
    ) environment[key] = value;
  }
  return environment;
}

function inspectXUse(): XUseCapability {
  ensureXUseSettings();
  syncXUseAccounts(getAccounts());
  const config = xuseConfigStatus();
  const bin = process.env.XUSE_BIN || "x-use";
  if (!commandAvailable(bin)) {
    return { available: false, bin, help: "", actions: emptyActions(), config, doctor: "unavailable", reason: `${bin} bulunamadı; x-use MCP kurulumu gerekli` };
  }
  const helpResult = spawnSync(/*turbopackIgnore: true*/ bin, ["--help"], { encoding: "utf8", timeout: 10_000, maxBuffer: 256 * 1024 });
  const help = `${helpResult.stdout || ""}\n${helpResult.stderr || ""}`.trim();
  const actions = emptyActions();
  actions.post = helpResult.error == null && /\bmcp\b/i.test(help);
  return {
    available: helpResult.error == null && helpResult.status === 0,
    bin,
    help,
    actions,
    config,
    doctor: "unavailable",
    reason: helpResult.error?.message || (!actions.post ? "x-use mcp komutu bulunamadı" : undefined),
  };
}

export function detectXUse(): XUseCapability {
  const capability = inspectXUse();
  if (!capability.available) return capability;
  const doctorResult = spawnSync(/*turbopackIgnore: true*/ capability.bin, ["doctor"], { encoding: "utf8", timeout: 20_000, maxBuffer: 256 * 1024 });
  const doctorOutput = `${doctorResult.stdout || ""}\n${doctorResult.stderr || ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join("; ");
  return {
    ...capability,
    doctor: doctorResult.error == null && doctorResult.status === 0 ? "ok" : "failed",
    reason: doctorResult.error?.message || (doctorResult.status === 0 ? capability.reason : doctorOutput || `${capability.bin} doctor başarısız`),
  };
}

export function xuseCapability(): { available: boolean; bin: string } {
  const capability = detectXUse();
  return {
    // Transport availability is separate from account readiness: doctor may fail
    // until the operator imports x-use settings/cookies, while MCP can still start.
    available: capability.available && capability.actions.post,
    bin: capability.bin,
  };
}

type RpcResponse = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

type RpcClient = {
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  notify: (method: string, params?: Record<string, unknown>) => void;
  close: () => void;
};

function jsonRpcClient(bin: string): RpcClient {
  const child = spawn(/* turbopackIgnore: true */ bin, ["mcp"], {
    cwd: process.env.XUSE_CWD || process.cwd(),
    env: xuseEnvironment() as NodeJS.ProcessEnv,
  });
  let nextId = 1;
  let buffer = "";
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr = `${stderr}${String(chunk)}`.slice(-4000);
  });
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: Buffer | string) => {
    buffer += String(chunk);
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message: RpcResponse;
      try {
        message = JSON.parse(line) as RpcResponse;
      } catch {
        continue;
      }
      if (typeof message.id !== "number") continue;
      const request = pending.get(message.id);
      if (!request) continue;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || "x-use MCP error"));
      else request.resolve(message.result);
    }
  });
  child.once("error", (error: Error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  });

  const write = (message: Record<string, unknown>) => {
    if (!child.stdin || child.killed) throw new Error("x-use MCP stdin kapalı");
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  return {
    call(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`x-use MCP ${method} timeout${stderr ? `: ${stderr.replace(/\s+/g, " ").trim()}` : ""}`));
        }, 120_000);
        pending.set(id, { resolve, reject, timer });
        try {
          write({ jsonrpc: "2.0", id, method, params });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    notify(method, params = {}) {
      write({ jsonrpc: "2.0", method, params });
    },
    close() {
      child.kill("SIGTERM");
    },
  };
}

function toolPayload(value: unknown): Record<string, unknown> {
  const result = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (result.isError) throw new Error("x-use MCP tool error");
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent as Record<string, unknown>;
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const text = (item as Record<string, unknown>).text;
    if (typeof text !== "string") continue;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: true, message: text };
    }
  }
  return result;
}

async function callTool(client: RpcClient, name: string, arguments_: Record<string, unknown>): Promise<Record<string, unknown>> {
  return toolPayload(await client.call("tools/call", { name, arguments: arguments_ }));
}

async function xuseHasTool(client: RpcClient, name: string): Promise<boolean> {
  const response = await client.call("tools/list");
  const payload = response && typeof response === "object" ? response as Record<string, unknown> : {};
  return Array.isArray(payload.tools) && payload.tools.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).name === name);
}

async function withXUse<T>(tool: string, args: Record<string, unknown>, transform: (value: Record<string, unknown>) => T): Promise<T> {
  const capability = detectXUse();
  if (!capability.available || capability.doctor !== "ok") throw new Error(capability.reason || "x-use doctor başarılı değil");
  const client = jsonRpcClient(capability.bin);
  try {
    await client.call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ispatla", version: "0.1.0" } });
    client.notify("notifications/initialized");
    if (!await xuseHasTool(client, tool)) throw new Error(`kurulu x-use sürümü ${tool} aracını desteklemiyor`);
    return transform(await callTool(client, tool, args));
  } finally { client.close(); }
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function safeTweet(value: unknown): Record<string, unknown> {
  const item = object(value);
  return { tweetId: string(item.tweet_id || item.tweetId), url: string(item.tweet_url || item.url), author: string(item.user_handle || item.author), text: string(item.text_content || item.text), likes: Number(item.like_count || item.likes || 0), reposts: Number(item.retweet_count || item.reposts || 0), replies: Number(item.reply_count || item.replies || 0), views: Number(item.view_count || item.views || 0), media: Array.isArray(item.media) ? item.media : [] };
}

export async function inspectXUseContent(input: { account: string; kind: "tweet" | "profile" | "search"; query: string; limit?: number }): Promise<XUseInspectResult> {
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit || 10)));
  const tool = input.kind === "tweet" ? "get_tweet" : input.kind === "profile" ? "search_profile" : "search_tweets";
  const payload = await withXUse(tool, input.kind === "tweet" ? { account: input.account, tweet_url: input.query, include_images: false } : input.kind === "profile" ? { account: input.account, profile: input.query, limit, include_images: false } : { account: input.account, keywords: input.query, limit, include_images: false }, (value) => value);
  const items = input.kind === "tweet" ? [safeTweet(payload)] : (Array.isArray(payload.tweets) ? payload.tweets : []).map(safeTweet);
  return { account: string(payload.account || input.account), kind: input.kind, items };
}

export async function getXUseAccountHealth(account: string): Promise<XUseAccountHealth> {
  return withXUse("get_account_health", { account }, (payload) => {
    const cookies = object(payload.cookies);
    return { config: object(payload.config), cookies: { configured: cookies.configured === true, valid: cookies.valid === true, problems: Array.isArray(cookies.problems) ? cookies.problems.map(string).slice(0, 8) : [] }, session: object(payload.session), queue: object(payload.queue), drafts: object(payload.drafts), metrics: object(payload.metrics) };
  });
}

export async function getLoggedXUseAccounts(): Promise<XUseLoggedAccount[]> {
  const configured = await withXUse("list_accounts", {}, (payload) => Array.isArray(payload.accounts) ? payload.accounts.map(object) : []);
  const active = new Set(configured.filter((item) => item.is_active !== false).map((item) => string(item.account_id)));
  const result: XUseLoggedAccount[] = [];
  for (const account of getAccounts().filter((item) => item.enabled && item.xuseAccountId && active.has(item.xuseAccountId))) {
    const health = await getXUseAccountHealth(account.xuseAccountId);
    if (health.cookies.configured !== true || health.cookies.valid !== true) continue;
    result.push({ id: account.id, handle: account.handle, displayName: account.displayName, xuseAccountId: account.xuseAccountId, health });
  }
  return result;
}

export async function getXUseTimeline(account: Pick<Account, "handle" | "xuseAccountId">): Promise<XUseInspectResult> {
  return inspectXUseContent({ account: account.xuseAccountId, kind: "profile", query: account.handle, limit: 20 });
}

export async function syncXUseQueue(account: string, queueId: string): Promise<{ status: string; found: boolean }> {
  return withXUse("list_queue", { account }, (payload) => {
    const item = (Array.isArray(payload.items) ? payload.items : []).map(object).find((candidate) => string(candidate.queue_id) === queueId);
    return { found: Boolean(item), status: string(item?.status) };
  });
}

export async function cancelXUseQueue(queueId: string): Promise<void> { await withXUse("cancel_queued_action", { queue_id: queueId }, () => undefined); }

export async function syncXUseAccountSubscription(account: Account, now = Math.floor(Date.now() / 1000)): Promise<XUseSubscriptionSyncResult> {
  if (!account.xuseAccountId.trim()) return { ok: false, reason: "x-use account id boş" };
  const capability = detectXUse();
  if (!capability.available || capability.doctor !== "ok") return { ok: false, reason: capability.reason || "x-use doctor başarılı değil" };
  const client = jsonRpcClient(capability.bin);
  try {
    await client.call("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "ispatla", version: "0.1.0" },
    });
    client.notify("notifications/initialized");
    if (!await xuseHasTool(client, "get_subscription_history")) return { ok: false, reason: "kurulu x-use sürümü subscription sync desteklemiyor" };
    const subscription = normaliseXUseSubscription(await callTool(client, "get_subscription_history", { account: account.xuseAccountId }), now);
    if (!subscription) return { ok: false, reason: "x-use subscription verisi döndürmedi" };
    if (!subscription.handle || subscription.handle !== account.handle.toLowerCase()) return { ok: false, reason: "x-use oturum handle'ı hesapla eşleşmiyor" };
    recordAccountSubscriptionSync({ accountId: account.id, ...subscription });
    return { ok: true, subscription };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    client.close();
  }
}

export async function syncDueXUseSubscriptions(now: number, errors: string[]): Promise<void> {
  for (const account of getAccounts().filter((item) => item.enabled && item.xuseAccountId)) {
    const key = `xuse_subscription_sync_${account.id}`;
    if (Number(getSetting(key, "0")) > now - 86400) continue;
    const result = await syncXUseAccountSubscription(account, now);
    setSetting(key, String(now), now);
    if (!result.ok) errors.push(`@${account.handle} subscription: ${result.reason}`);
  }
}

export async function runXUseJob(input: {
  action: XUseAction;
  account: string;
  text: string;
  mediaPath?: string;
  existingQueueId?: string;
  profileHandle?: string;
  targetUrl?: string;
}): Promise<XUseJobResult> {
  if (!["post", "like", "retweet", "reply"].includes(input.action)) return { ok: false, receipt: "", reason: `${input.action} x-use queue tarafından desteklenmiyor` };
  if (!input.account.trim()) return { ok: false, receipt: "", reason: "x-use account id boş" };
  const capability = detectXUse();
  if (!capability.available || !capability.actions.post || capability.doctor !== "ok") return { ok: false, receipt: "", reason: capability.reason || "x-use doctor başarılı değil" };
  const client = jsonRpcClient(capability.bin);
  try {
    await client.call("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "ispatla", version: "0.1.0" },
    });
    client.notify("notifications/initialized");
    let queueId = input.existingQueueId || "";
    let queued: Record<string, unknown> = {};
    if (!queueId) {
      queued = input.action === "post"
        ? await callTool(client, "queue_post", { account: input.account, text: input.text, media: input.mediaPath ? [input.mediaPath] : [] })
        : await callTool(client, "queue_engagement", { account: input.account, action: input.action, tweet_url: input.targetUrl, ...(input.action === "reply" ? { text: input.text } : {}) });
      queueId = String(queued.queue_id || queued.queueId || "");
      if (queued.ok === false || !queueId) throw new Error(String(queued.error || queued.message || "x-use queue_post queue id döndürmedi"));
    } else {
      queued = await callTool(client, "list_queue", { account: input.account });
      const item = (Array.isArray(queued.items) ? queued.items : []).find((candidate) => candidate && typeof candidate === "object" && String((candidate as Record<string, unknown>).queue_id || "") === queueId) as Record<string, unknown> | undefined;
      if (!item) return { ok: false, receipt: JSON.stringify({ queued }), queueId, reason: "x-use queue id artık görünmüyor; duplicate yayın riski nedeniyle tekrar queue edilmedi" };
      if (item.status === "done") return { ok: true, receipt: JSON.stringify({ queued, alreadyDone: true }), queueId, xuseStatus: "done" };
      if (!["pending", "failed"].includes(String(item.status))) return { ok: false, receipt: JSON.stringify({ queued }), queueId, reason: `x-use queue durumu çalıştırılamaz: ${String(item.status)}` };
    }
    const processed = await callTool(client, "process_queue", { account: input.account, max_actions: 1 });
    const executed = Array.isArray(processed.executed) ? processed.executed : [];
    const succeeded = Number(processed.succeeded || 0);
    const success = succeeded > 0 || executed.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).success === true);
    const receipt = JSON.stringify({ queued, processed });
    if (!success) return { ok: false, receipt, queueId, xuseStatus: "failed", reason: String(processed.message || processed.error || "x-use process_queue işi çalıştırmadı; cap veya pacing nedeniyle bekliyor olabilir") };
    let remoteUrl = "";
    if (input.profileHandle) {
      try {
        const profile = await callTool(client, "search_profile", { profile: input.profileHandle, limit: 20, account: input.account });
        const tweets = Array.isArray(profile.tweets) ? profile.tweets : [];
        const match = tweets.find((tweet) => {
          if (!tweet || typeof tweet !== "object") return false;
          const value = tweet as Record<string, unknown>;
          return normalisePostText(String(value.text_content || value.text || "")) === normalisePostText(input.text);
        }) as Record<string, unknown> | undefined;
        remoteUrl = String(match?.tweet_url || match?.url || "");
      } catch {
        // The post result remains pending until the next reconciliation pass.
      }
    }
    return { ok: true, receipt, queueId, remoteUrl, xuseStatus: "done" };
  } catch (error) {
    return { ok: false, receipt: "", reason: error instanceof Error ? error.message : String(error) };
  } finally {
    client.close();
  }
}

/** Kept for old callers/tests: synchronous direct `x-use post` is not a valid contract. */
export function runXUse(input: { action: XUseAction; text: string; mediaPath?: string }): XUseJobResult {
  return { ok: false, receipt: "", reason: `${input.action} için doğrudan x-use CLI kontratı yok; MCP queue adapter kullanılmalı` };
}
