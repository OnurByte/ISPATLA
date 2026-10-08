import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { currentOwnerId } from "./owner-context";
import { ensureDatabase, getAccounts, getCategories } from "./db";
import { getXAccountAuthState } from "./x-oauth-store";
import type { XAction } from "./x-policy";

type Statement = { all(): unknown[] };
type Database = { exec(sql: string): void; prepare(sql: string): Statement };
type DatabaseCtor = new (path: string) => Database;
const builtin = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule;
const DatabaseCtorImpl: DatabaseCtor = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
  ? (builtin("bun:sqlite") as { Database: DatabaseCtor }).Database
  : (builtin("node:sqlite") as { DatabaseSync: DatabaseCtor }).DatabaseSync;
const DB_PATH = process.env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3");
let database: Database | undefined;
let ready = false;

function q(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function n(value: number): string { if (!Number.isSafeInteger(value)) throw new Error("integer value required"); return String(value); }
function owner(): string {
  const value = currentOwnerId();
  if (!value) throw new Error("policy data requires a verified owner context");
  return value;
}
function rows<T>(sql: string): T[] {
  if (!database) throw new Error("policy store is not initialized");
  return database.prepare(sql).all() as T[];
}
function exec(sql: string): void {
  if (!database) throw new Error("policy store is not initialized");
  database.exec(sql);
}
function tx<T>(fn: () => T): T {
  exec("BEGIN IMMEDIATE;");
  try { const result = fn(); exec("COMMIT;"); return result; }
  catch (error) { exec("ROLLBACK;"); throw error; }
}

export type KillScope = "global" | "account" | "category" | "action";
export type PolicyKillControl = {
  scope: KillScope; value: string; enabled: boolean; version: number; updatedAt: number;
};
export type EffectivePolicyKills = { global: boolean; account: boolean; category: boolean; actions: string[] };

export function ensurePolicyStore(): true {
  if (ready) return true;
  if (!ensureDatabase()) throw new Error("database is unavailable");
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseCtorImpl(DB_PATH);
  exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  exec(`CREATE TABLE IF NOT EXISTS x_policy_kill_controls (
    owner_user_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('global','account','category','action')),
    value TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), version INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, PRIMARY KEY(owner_user_id,scope,value)
  );
  CREATE TABLE IF NOT EXISTS x_policy_kill_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_user_id TEXT NOT NULL, scope TEXT NOT NULL, value TEXT NOT NULL,
    previous_enabled INTEGER, enabled INTEGER NOT NULL, previous_version INTEGER NOT NULL,
    version INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS x_reply_summon_audits (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, account_id INTEGER NOT NULL, connected_x_user_id TEXT NOT NULL,
    target_id TEXT NOT NULL, author_x_user_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('mention','quote')),
    observed_at INTEGER NOT NULL, source TEXT NOT NULL CHECK(source='official_x_api'),
    UNIQUE(owner_user_id,account_id,target_id)
  );
  CREATE INDEX IF NOT EXISTS x_reply_summon_owner_target_idx ON x_reply_summon_audits(owner_user_id,account_id,target_id,observed_at);`);
  ready = true;
  return true;
}

function scopeValue(scope: KillScope, value: string | number | undefined): string {
  if (scope === "global") {
    if (value !== undefined && value !== "") throw new Error("global controls do not accept a value");
    return "*";
  }
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${scope} value is required`);
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 128) throw new Error(`${scope} value is invalid`);
  if (scope === "account") {
    if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized)) || Number(normalized) < 1) throw new Error("account id is invalid");
    const account = getAccounts().find(item => String(item.id) === normalized && item.ownerUserId === owner());
    if (!account) throw new Error("account not found for owner");
    return normalized;
  }
  if (scope === "category" && !getCategories().some(item => item.slug === normalized)) throw new Error("category not found");
  if (scope === "action" && !["post", "repost", "reply", "quote", "media"].includes(normalized)) throw new Error("action is invalid");
  return normalized;
}

function mapControl(row: Record<string, unknown>): PolicyKillControl {
  return { scope: row.scope as KillScope, value: String(row.value), enabled: Number(row.enabled) === 1, version: Number(row.version), updatedAt: Number(row.updated_at) };
}

export function listPolicyKillControls(): PolicyKillControl[] {
  ensurePolicyStore(); const current = owner();
  return rows<Record<string, unknown>>(`SELECT scope,value,enabled,version,updated_at FROM x_policy_kill_controls WHERE owner_user_id=${q(current)} ORDER BY scope,value;`).map(mapControl);
}

export function setPolicyKillControl(input: {
  scope: KillScope; value?: string | number; enabled: boolean; expectedVersion: number; reason: string; now?: number;
}): PolicyKillControl {
  ensurePolicyStore(); const current = owner();
  if (!( ["global", "account", "category", "action"] as string[]).includes(input.scope) || typeof input.enabled !== "boolean") throw new Error("invalid policy control");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("expected version is invalid");
  if (!input.reason.trim() || input.reason.length > 500) throw new Error("audit reason is required");
  const value = scopeValue(input.scope, input.value);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("timestamp is invalid");
  return tx(() => {
    const previous = rows<Record<string, unknown>>(`SELECT enabled,version FROM x_policy_kill_controls WHERE owner_user_id=${q(current)} AND scope=${q(input.scope)} AND value=${q(value)};`)[0];
    const previousVersion = previous ? Number(previous.version) : 0;
    if (previousVersion !== input.expectedVersion) throw new Error("policy control version conflict");
    const version = previousVersion + 1;
    exec(`INSERT INTO x_policy_kill_controls(owner_user_id,scope,value,enabled,version,updated_at)
      VALUES (${q(current)},${q(input.scope)},${q(value)},${input.enabled ? 1 : 0},${version},${n(now)})
      ON CONFLICT(owner_user_id,scope,value) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,updated_at=excluded.updated_at;`);
    exec(`INSERT INTO x_policy_kill_audit(owner_user_id,scope,value,previous_enabled,enabled,previous_version,version,reason,created_at)
      VALUES (${q(current)},${q(input.scope)},${q(value)},${previous ? Number(previous.enabled) : "NULL"},${input.enabled ? 1 : 0},${previousVersion},${version},${q(input.reason.trim())},${n(now)});`);
    return { scope: input.scope, value, enabled: input.enabled, version, updatedAt: now };
  });
}

export function getEffectivePolicyKills(input: { accountId: number; category?: string; action: XAction }): EffectivePolicyKills {
  ensurePolicyStore(); const current = owner();
  const value = scopeValue("account", input.accountId);
  if (input.category) scopeValue("category", input.category);
  if (!( ["post", "repost", "reply", "quote", "media"] as string[]).includes(input.action)) throw new Error("action is invalid");
  const active = rows<{ scope: string; value: string }>(`SELECT scope,value FROM x_policy_kill_controls WHERE owner_user_id=${q(current)} AND enabled=1
    AND ((scope='global' AND value='*') OR (scope='account' AND value=${q(value)})
    OR (scope='category' AND value=${q(input.category || "")}) OR (scope='action' AND value=${q(input.action)}));`);
  return { global: active.some(row => row.scope === "global"), account: active.some(row => row.scope === "account"),
    category: active.some(row => row.scope === "category"), actions: active.some(row => row.scope === "action") ? [input.action] : [] };
}

type OfficialSummonPost = {
  id: string; author_id: string; mentionedUserIds?: string[]; quotedAuthorXUserId?: string;
};
/** Internal-only: callers must pass a post fetched from the official X API, never a user assertion. */
export function recordOfficialReplySummon(input: { accountId: number; connectedXUserId: string; kind: "mention" | "quote"; post: OfficialSummonPost; observedAt: number }): string {
  ensurePolicyStore(); const current = owner();
  if (!/^\d{1,19}$/.test(input.connectedXUserId) || !/^\d{1,19}$/.test(input.post.id) || !/^\d{1,19}$/.test(input.post.author_id)
    || input.post.author_id === input.connectedXUserId || !Number.isSafeInteger(input.accountId) || input.accountId < 1
    || !Number.isSafeInteger(input.observedAt) || input.observedAt < 0) throw new Error("official reply summon evidence is invalid");
  const account = getAccounts().find(item => item.id === input.accountId && item.ownerUserId === current);
  const binding = getXAccountAuthState(input.accountId, current);
  if (!account || !binding?.connected || binding.xUserId !== input.connectedXUserId) throw new Error("connected X account identity mismatch");
  const summoned = input.kind === "mention"
    ? input.post.mentionedUserIds?.includes(input.connectedXUserId) === true
    : input.post.quotedAuthorXUserId === input.connectedXUserId;
  if (!summoned) throw new Error("official post does not summon the connected account");
  const id = randomUUID();
  exec(`INSERT INTO x_reply_summon_audits(id,owner_user_id,account_id,connected_x_user_id,target_id,author_x_user_id,kind,observed_at,source)
    VALUES (${q(id)},${q(current)},${n(input.accountId)},${q(input.connectedXUserId)},${q(input.post.id)},${q(input.post.author_id)},${q(input.kind)},${n(input.observedAt)},'official_x_api');`);
  return id;
}

export function getAuditedReplyEligibility(input: { accountId: number; targetId: string; now: number }): {
  eventId: string; kind: "mention" | "quote"; targetId: string; accountId: number; observedAt: number;
  source: "official_x_api"; authorXUserId: string; connectedXUserId: string; summonedXUserId: string;
} | undefined {
  ensurePolicyStore(); const current = owner();
  if (!/^\d{1,19}$/.test(input.targetId) || !Number.isSafeInteger(input.accountId) || input.accountId < 1 || !Number.isSafeInteger(input.now)) return undefined;
  const account = getAccounts().find(item => item.id === input.accountId && item.ownerUserId === current);
  const binding = getXAccountAuthState(input.accountId, current);
  if (!account || !binding?.connected) return undefined;
  const row = rows<Record<string, unknown>>(`SELECT id,target_id,account_id,connected_x_user_id,author_x_user_id,kind,observed_at FROM x_reply_summon_audits
    WHERE owner_user_id=${q(current)} AND account_id=${n(input.accountId)} AND target_id=${q(input.targetId)} AND source='official_x_api'
    ORDER BY observed_at DESC LIMIT 1;`)[0];
  if (!row || String(row.connected_x_user_id) !== binding.xUserId || Number(row.observed_at) > input.now || Number(row.observed_at) < input.now - 7 * 86400) return undefined;
  return { eventId: String(row.id), kind: row.kind as "mention" | "quote", targetId: String(row.target_id), accountId: Number(row.account_id),
    observedAt: Number(row.observed_at), source: "official_x_api", authorXUserId: String(row.author_x_user_id),
    connectedXUserId: String(row.connected_x_user_id), summonedXUserId: String(row.connected_x_user_id) };
}

export function listPolicyKillAudit(): Array<{ scope: KillScope; value: string; enabled: boolean; version: number; reason: string; createdAt: number }> {
  ensurePolicyStore(); const current = owner();
  return rows<Record<string, unknown>>(`SELECT scope,value,enabled,version,reason,created_at FROM x_policy_kill_audit WHERE owner_user_id=${q(current)} ORDER BY id;`).map(row => ({
    scope: row.scope as KillScope, value: String(row.value), enabled: Number(row.enabled) === 1, version: Number(row.version), reason: String(row.reason), createdAt: Number(row.created_at),
  }));
}
