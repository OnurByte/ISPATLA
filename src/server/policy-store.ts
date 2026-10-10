import { and, desc, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";
import { accounts, categories, xPolicyKillAudit, xPolicyKillControls, xReplySummonAudits } from "./postgres-schema";
import { getPostgresAccount, getPostgresCategoriesForAccount } from "./postgres-accounts";
import { getPostgresXAccountAuthState } from "./postgres-x-oauth";
import type { XAction } from "./x-policy";

export type KillScope = "global" | "account" | "category" | "action";
export type PolicyKillControl = { scope: KillScope; value: string; enabled: boolean; version: number; updatedAt: number };
export type EffectivePolicyKills = { global: boolean; account: boolean; category: boolean; actions: string[] };

function owner(): string {
  const value = currentOwnerId();
  if (!value) throw new Error("policy data requires a verified owner context");
  return value;
}

async function scopeValue(scope: KillScope, value: string | number | undefined, current: string): Promise<string> {
  if (scope === "global") {
    if (value !== undefined && value !== "") throw new Error("global controls do not accept a value");
    return "*";
  }
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${scope} value is required`);
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 128) throw new Error(`${scope} value is invalid`);
  if (scope === "account") {
    if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized)) || Number(normalized) < 1) throw new Error("account id is invalid");
    if (!await getPostgresAccount(current, Number(normalized))) throw new Error("account not found for owner");
  }
  if (scope === "category") {
    const accessible = await getPostgresDb().select({ id: categories.id }).from(categories)
      .where(and(eq(categories.slug, normalized), or(eq(categories.ownerUserId, current), isNull(categories.ownerUserId)))).limit(1);
    if (!accessible.length) throw new Error("category not found");
  }
  if (scope === "action" && !["post", "repost", "reply", "quote", "media"].includes(normalized)) throw new Error("action is invalid");
  return normalized;
}

function mapControl(row: typeof xPolicyKillControls.$inferSelect): PolicyKillControl {
  return { scope: row.scope as KillScope, value: row.value, enabled: row.enabled, version: row.version, updatedAt: row.updatedAt };
}

export async function listPolicyKillControls(): Promise<PolicyKillControl[]> {
  const rows = await getPostgresDb().select().from(xPolicyKillControls).where(eq(xPolicyKillControls.ownerUserId, owner()))
    .orderBy(xPolicyKillControls.scope, xPolicyKillControls.value);
  return rows.map(mapControl);
}

export async function setPolicyKillControl(input: {
  scope: KillScope; value?: string | number; enabled: boolean; expectedVersion: number; reason: string; now?: number;
}): Promise<PolicyKillControl> {
  const current = owner();
  if (!( ["global", "account", "category", "action"] as string[]).includes(input.scope) || typeof input.enabled !== "boolean") throw new Error("invalid policy control");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("expected version is invalid");
  if (!input.reason.trim() || input.reason.length > 500) throw new Error("audit reason is required");
  const value = await scopeValue(input.scope, input.value, current);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("timestamp is invalid");
  return getPostgresDb().transaction(async (tx) => {
    const [previous] = await tx.select().from(xPolicyKillControls).where(and(eq(xPolicyKillControls.ownerUserId, current), eq(xPolicyKillControls.scope, input.scope), eq(xPolicyKillControls.value, value))).for("update");
    const previousVersion = previous?.version ?? 0;
    if (previousVersion !== input.expectedVersion) throw new Error("policy control version conflict");
    const control = { ownerUserId: current, scope: input.scope, value, enabled: input.enabled, version: previousVersion + 1, updatedAt: now };
    await tx.insert(xPolicyKillControls).values(control).onConflictDoUpdate({
      target: [xPolicyKillControls.ownerUserId, xPolicyKillControls.scope, xPolicyKillControls.value],
      set: { enabled: control.enabled, version: control.version, updatedAt: now },
    });
    await tx.insert(xPolicyKillAudit).values({ ownerUserId: current, scope: input.scope, value,
      previousEnabled: previous?.enabled ?? null, enabled: input.enabled, previousVersion, version: control.version,
      reason: input.reason.trim(), createdAt: now });
    return { scope: input.scope, value, enabled: input.enabled, version: control.version, updatedAt: now };
  });
}

export async function getEffectivePolicyKills(input: { accountId: number; category?: string; action: XAction }): Promise<EffectivePolicyKills> {
  const current = owner();
  await scopeValue("account", input.accountId, current);
  if (input.category) await getPostgresCategoriesForAccount(current, input.accountId).then((rows) => {
    if (!rows.some((row) => row.slug === input.category)) throw new Error("category not found");
  });
  if (!( ["post", "repost", "reply", "quote", "media"] as string[]).includes(input.action)) throw new Error("action is invalid");
  const active = await getPostgresDb().select({ scope: xPolicyKillControls.scope, value: xPolicyKillControls.value })
    .from(xPolicyKillControls).where(and(eq(xPolicyKillControls.ownerUserId, current), eq(xPolicyKillControls.enabled, true)));
  const matching = active.filter((row) => (row.scope === "global" && row.value === "*")
    || (row.scope === "account" && row.value === String(input.accountId))
    || (row.scope === "category" && row.value === (input.category || ""))
    || (row.scope === "action" && row.value === input.action));
  return { global: matching.some((row) => row.scope === "global"), account: matching.some((row) => row.scope === "account"),
    category: matching.some((row) => row.scope === "category"), actions: matching.some((row) => row.scope === "action") ? [input.action] : [] };
}

type OfficialSummonPost = { id: string; author_id: string; mentionedUserIds?: string[]; quotedAuthorXUserId?: string };
/** Internal-only: callers must pass a post fetched from the official X API, never a user assertion. */
export async function recordOfficialReplySummon(input: {
  accountId: number; connectedXUserId: string; kind: "mention" | "quote"; post: OfficialSummonPost; observedAt: number;
}): Promise<string> {
  const current = owner();
  if (!/^\d{1,19}$/.test(input.connectedXUserId) || !/^\d{1,19}$/.test(input.post.id) || !/^\d{1,19}$/.test(input.post.author_id)
    || input.post.author_id === input.connectedXUserId || !Number.isSafeInteger(input.accountId) || input.accountId < 1
    || !Number.isSafeInteger(input.observedAt) || input.observedAt < 0) throw new Error("official reply summon evidence is invalid");
  const [account, binding] = await Promise.all([getPostgresAccount(current, input.accountId), getPostgresXAccountAuthState(input.accountId, current)]);
  if (!account || !binding?.connected || binding.xUserId !== input.connectedXUserId) throw new Error("connected 𝕏 account identity mismatch");
  const summoned = input.kind === "mention" ? input.post.mentionedUserIds?.includes(input.connectedXUserId) === true
    : input.post.quotedAuthorXUserId === input.connectedXUserId;
  if (!summoned) throw new Error("official post does not summon the connected account");
  const id = randomUUID();
  await getPostgresDb().insert(xReplySummonAudits).values({ id, ownerUserId: current, accountId: input.accountId,
    connectedXUserId: input.connectedXUserId, targetId: input.post.id, authorXUserId: input.post.author_id, kind: input.kind,
    observedAt: input.observedAt, source: "official_x_api" });
  return id;
}

export async function getAuditedReplyEligibility(input: { accountId: number; targetId: string; now: number }): Promise<{
  eventId: string; kind: "mention" | "quote"; targetId: string; accountId: number; observedAt: number;
  source: "official_x_api"; authorXUserId: string; connectedXUserId: string; summonedXUserId: string;
} | undefined> {
  const current = owner();
  if (!/^\d{1,19}$/.test(input.targetId) || !Number.isSafeInteger(input.accountId) || input.accountId < 1 || !Number.isSafeInteger(input.now)) return undefined;
  const [account, binding] = await Promise.all([getPostgresAccount(current, input.accountId), getPostgresXAccountAuthState(input.accountId, current)]);
  if (!account || !binding?.connected) return undefined;
  const [row] = await getPostgresDb().select().from(xReplySummonAudits).where(and(eq(xReplySummonAudits.ownerUserId, current),
    eq(xReplySummonAudits.accountId, input.accountId), eq(xReplySummonAudits.targetId, input.targetId), eq(xReplySummonAudits.source, "official_x_api")))
    .orderBy(desc(xReplySummonAudits.observedAt)).limit(1);
  if (!row || row.connectedXUserId !== binding.xUserId || row.observedAt > input.now || row.observedAt < input.now - 7 * 86400) return undefined;
  return { eventId: row.id, kind: row.kind as "mention" | "quote", targetId: row.targetId, accountId: row.accountId,
    observedAt: row.observedAt, source: "official_x_api", authorXUserId: row.authorXUserId,
    connectedXUserId: row.connectedXUserId, summonedXUserId: row.connectedXUserId };
}

export async function listPolicyKillAudit(): Promise<Array<{ scope: KillScope; value: string; enabled: boolean; version: number; reason: string; createdAt: number }>> {
  const rows = await getPostgresDb().select().from(xPolicyKillAudit).where(eq(xPolicyKillAudit.ownerUserId, owner())).orderBy(xPolicyKillAudit.id);
  return rows.map((row) => ({ scope: row.scope as KillScope, value: row.value, enabled: row.enabled, version: row.version, reason: row.reason, createdAt: row.createdAt }));
}
