import { and, asc, count, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { getPostgresDb } from "@/server/postgres";
import { aiBudgetReservations, appSettings, automationLogs, secrets, usageEvents } from "@/server/postgres-schema";
import { currentOwnerId } from "@/server/owner-context";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function settingKey(name: string, owner = currentOwnerId()) {
  return owner && (name.startsWith("ai_") || name.startsWith("jev_") || name === "writing_style_settings")
    ? `owner:${encodeURIComponent(owner)}:${name}` : name;
}

export async function getPostgresSetting(name: string, fallback = "", owner = currentOwnerId()): Promise<string> {
  const [row] = await getPostgresDb().select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.name, settingKey(name, owner))).limit(1);
  return row?.value || fallback;
}

export async function setPostgresSetting(name: string, value: string, now = Math.floor(Date.now() / 1000), owner = currentOwnerId()): Promise<void> {
  await getPostgresDb().insert(appSettings).values({ name: settingKey(name, owner), value, updatedAt: now }).onConflictDoUpdate({
    target: appSettings.name, set: { value, updatedAt: now },
  });
}

function secretName(name: string, owner = currentOwnerId()) {
  return owner ? `owner:${encodeURIComponent(owner)}:${name}` : name;
}

export async function listPostgresSecretMetas(owner = currentOwnerId()) {
  const prefix = owner ? `owner:${encodeURIComponent(owner)}:` : "";
  const rows = await getPostgresDb().select({ name: secrets.name, provider: secrets.provider, updatedAt: secrets.updatedAt }).from(secrets)
    .where(prefix ? sql`left(${secrets.name}, ${prefix.length}) = ${prefix}` : undefined).orderBy(asc(secrets.name));
  return rows.map(({ name, provider, updatedAt }) => ({ name: prefix ? name.slice(prefix.length) : name, provider, configured: true, masked: "••••••••••••", updatedAt }));
}

export async function savePostgresSecret(name: string, provider: string, ciphertext: string, now = Math.floor(Date.now() / 1000), owner = currentOwnerId()): Promise<void> {
  await getPostgresDb().insert(secrets).values({ name: secretName(name, owner), provider, ciphertext, updatedAt: now }).onConflictDoUpdate({
    target: secrets.name, set: { provider, ciphertext, updatedAt: now },
  });
}

export async function getPostgresSecret(name: string, owner = currentOwnerId()) {
  const [row] = await getPostgresDb().select({ provider: secrets.provider, ciphertext: secrets.ciphertext, updatedAt: secrets.updatedAt })
    .from(secrets).where(eq(secrets.name, secretName(name, owner))).limit(1);
  return row || null;
}

export async function deletePostgresSecret(name: string, owner = currentOwnerId()): Promise<void> {
  await getPostgresDb().delete(secrets).where(eq(secrets.name, secretName(name, owner)));
}

function vaultKey(): Buffer | null {
  const key = process.env.ISPATLA_SECRET_KEY;
  return key ? scryptSync(key, "ispatla-vault-v1", 32) : null;
}
export function postgresVaultReady() { return Boolean(vaultKey()); }
export function encryptPostgresSecret(value: string) {
  const key = vaultKey();
  if (!key) throw new Error("ISPATLA_SECRET_KEY must be configured");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
}
export function decryptPostgresSecret(value: string) {
  const key = vaultKey();
  if (!key) throw new Error("ISPATLA_SECRET_KEY must be configured");
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("invalid secret envelope");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
export async function getPostgresSecretValue(name: string, environmentName: string, owner = currentOwnerId()) {
  const sharedEnvironment = !owner || owner === process.env.ISPATLA_OPERATOR_USER_ID ? process.env[environmentName] || null : null;
  try { const row = await getPostgresSecret(name, owner); return row ? decryptPostgresSecret(row.ciphertext) : sharedEnvironment; }
  catch { return sharedEnvironment; }
}

const ownerPredicate = (owner = currentOwnerId()) => owner ? eq(usageEvents.ownerUserId, owner) : isNull(usageEvents.ownerUserId);
type UsageSummaryTotals = { events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number; inputTokens: number; outputTokens: number };
const zeroSummary = (): UsageSummaryTotals => ({ events: 0, units: 0, estimatedUsd: 0, reportedUsd: 0, unknownCostEvents: 0, inputTokens: 0, outputTokens: 0 });
function numericRow(row: UsageSummaryTotals | undefined): UsageSummaryTotals;
function numericRow<T extends Record<string, unknown>>(row: T): { [K in keyof T]: number };
function numericRow(row: Record<string, unknown> | undefined) {
  return row ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)])) : zeroSummary();
}

export async function getPostgresUsageSummary(since = 0, owner = currentOwnerId()) {
  const db = getPostgresDb();
  const filter = and(gte(usageEvents.createdAt, since), ownerPredicate(owner));
  const fields = {
    events: count(), units: sql<number>`coalesce(sum(${usageEvents.units}), 0)`,
    estimatedUsd: sql<number>`coalesce(sum(${usageEvents.estimatedCostUsd}), 0)`,
    reportedUsd: sql<number>`coalesce(sum(${usageEvents.reportedCostUsd}), 0)`,
    unknownCostEvents: sql<number>`coalesce(sum(case when ${usageEvents.costBasis} = 'unknown' then 1 else 0 end), 0)`,
    inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)`, outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
  };
  const total = numericRow((await db.select(fields).from(usageEvents).where(filter))[0] as UsageSummaryTotals | undefined);
  const common = { events: count(), units: sql<number>`coalesce(sum(${usageEvents.units}), 0)`,
    estimatedUsd: sql<number>`coalesce(sum(${usageEvents.estimatedCostUsd}), 0)`, reportedUsd: sql<number>`coalesce(sum(${usageEvents.reportedCostUsd}), 0)`,
    unknownCostEvents: sql<number>`coalesce(sum(case when ${usageEvents.costBasis} = 'unknown' then 1 else 0 end), 0)` };
  const order = desc(sql`sum(${usageEvents.units})`);
  const [providerRows, modelRows, kindRows] = await Promise.all([
    db.select({ provider: usageEvents.provider, ...common }).from(usageEvents).where(filter).groupBy(usageEvents.provider).orderBy(order),
    db.select({ provider: usageEvents.provider, model: usageEvents.model, ...common }).from(usageEvents).where(filter).groupBy(usageEvents.provider, usageEvents.model).orderBy(order),
    db.select({ provider: usageEvents.provider, kind: usageEvents.kind, ...common }).from(usageEvents).where(filter).groupBy(usageEvents.provider, usageEvents.kind).orderBy(order),
  ]);
  return { ...total, byProvider: providerRows.map((row) => numericRow(row)), byModel: modelRows.map((row) => numericRow(row)), byKind: kindRows.map((row) => numericRow(row)) };
}

async function readBudget(name: string, owner = currentOwnerId()) {
  const value = Number(await getPostgresSetting(name, "0", owner));
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error("AI budget configuration is invalid");
  return value;
}

export async function getPostgresAiBudgetStatus(now = Math.floor(Date.now() / 1000), owner = currentOwnerId()) {
  const day = new Date(now * 1000), dayStart = Math.floor(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) / 1000);
  const monthStart = Math.floor(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1) / 1000);
  const reservationOwner = owner ? eq(aiBudgetReservations.ownerUserId, owner) : isNull(aiBudgetReservations.ownerUserId);
  const committed = async (since: number) => {
    const usage = await getPostgresDb().select({ amount: sql<number>`coalesce(sum(coalesce(${usageEvents.reportedCostUsd}, ${usageEvents.estimatedCostUsd}, 0)), 0)` })
      .from(usageEvents).where(and(gte(usageEvents.createdAt, since), ownerPredicate(owner)));
    const reservations = await getPostgresDb().select({ amount: sql<number>`coalesce(sum(${aiBudgetReservations.reservedUsd}), 0)` })
      .from(aiBudgetReservations).where(and(gte(aiBudgetReservations.createdAt, since), reservationOwner, or(eq(aiBudgetReservations.status, "pending"), eq(aiBudgetReservations.status, "ambiguous"))));
    return Number(usage[0]?.amount || 0) + Number(reservations[0]?.amount || 0);
  };
  const budgets = await Promise.all([readBudget("ai_daily_budget_usd", owner), readBudget("ai_monthly_budget_usd", owner)]);
  const pending = await getPostgresDb().select({ count: count() }).from(aiBudgetReservations)
    .where(and(reservationOwner, or(eq(aiBudgetReservations.status, "pending"), eq(aiBudgetReservations.status, "ambiguous"))));
  const [dailyCommittedUsd, monthlyCommittedUsd] = await Promise.all([committed(dayStart), committed(monthStart)]);
  return { dailyBudgetUsd: budgets[0], monthlyBudgetUsd: budgets[1], dailyCommittedUsd, monthlyCommittedUsd, pendingReservations: Number(pending[0]?.count || 0) };
}

export async function reservePostgresAiBudget(input: { id: string; task: string; provider: string; model: string; reservedUsd: number | null; now: number }, owner = currentOwnerId()) {
  if (!input.id || !Number.isFinite(input.now) || input.now < 0 || (input.reservedUsd !== null && (!Number.isFinite(input.reservedUsd) || input.reservedUsd < 0))) throw new Error("AI budget reservation is invalid");
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${owner ?? "ispatla:unowned"}, 0))`);
    const ownerFilter = owner ? eq(aiBudgetReservations.ownerUserId, owner) : isNull(aiBudgetReservations.ownerUserId);
    const [existing] = await tx.select({ id: aiBudgetReservations.id, status: aiBudgetReservations.status }).from(aiBudgetReservations)
      .where(and(eq(aiBudgetReservations.id, input.id), ownerFilter)).limit(1);
    if (existing) return { id: existing.id, allowed: existing.status === "pending" || existing.status === "ambiguous" };
    const budgets = await Promise.all([readBudget("ai_daily_budget_usd", owner), readBudget("ai_monthly_budget_usd", owner)]);
    if ((budgets[0] > 0 || budgets[1] > 0) && input.reservedUsd === null) return { id: input.id, allowed: false, reason: "unknown_cost" as const };
    const date = new Date(input.now * 1000);
    const dayStart = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
    const monthStart = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
    const reserveOwner = owner ? eq(aiBudgetReservations.ownerUserId, owner) : isNull(aiBudgetReservations.ownerUserId);
    const committed = async (since: number) => {
      const [usage] = await tx.select({ amount: sql<number>`coalesce(sum(coalesce(${usageEvents.reportedCostUsd}, ${usageEvents.estimatedCostUsd}, 0)), 0)` })
        .from(usageEvents).where(and(gte(usageEvents.createdAt, since), ownerPredicate(owner)));
      const [reserved] = await tx.select({ amount: sql<number>`coalesce(sum(${aiBudgetReservations.reservedUsd}), 0)` }).from(aiBudgetReservations)
        .where(and(gte(aiBudgetReservations.createdAt, since), reserveOwner, or(eq(aiBudgetReservations.status, "pending"), eq(aiBudgetReservations.status, "ambiguous"))));
      return Number(usage?.amount || 0) + Number(reserved?.amount || 0);
    };
    if ((budgets[0] > 0 && await committed(dayStart) + (input.reservedUsd || 0) > budgets[0])
      || (budgets[1] > 0 && await committed(monthStart) + (input.reservedUsd || 0) > budgets[1])) return { id: input.id, allowed: false, reason: "budget_exceeded" as const };
    await tx.insert(aiBudgetReservations).values({ id: input.id, task: input.task, provider: input.provider, model: input.model,
      reservedUsd: input.reservedUsd, createdAt: input.now, ownerUserId: owner ?? null, status: "pending" });
    return { id: input.id, allowed: true };
  });
}

export async function settlePostgresAiBudgetReservation(id: string, input: {
  outcome: "success" | "known_failure" | "ambiguous"; now: number; kind?: string; units?: number;
  estimatedUsd?: number | null; reportedUsd?: number | null; inputTokens?: number | null; outputTokens?: number | null; metadata?: Record<string, unknown>;
}, owner = currentOwnerId()) {
  const db = getPostgresDb();
  await db.transaction(async (tx) => {
    const ownerFilter = owner ? eq(aiBudgetReservations.ownerUserId, owner) : isNull(aiBudgetReservations.ownerUserId);
    const [reservation] = await tx.select().from(aiBudgetReservations).where(and(eq(aiBudgetReservations.id, id), ownerFilter)).limit(1);
    if (!reservation || reservation.status !== "pending") return;
    await tx.update(aiBudgetReservations).set({ status: input.outcome === "success" ? "settled" : input.outcome === "known_failure" ? "released" : "ambiguous", settledAt: input.now })
      .where(and(eq(aiBudgetReservations.id, id), ownerFilter, eq(aiBudgetReservations.status, "pending")));
    if (input.outcome !== "success") return;
    await tx.insert(usageEvents).values({ kind: input.kind || reservation.task, provider: reservation.provider, model: reservation.model,
      units: input.units || 1, estimatedUsd: input.estimatedUsd ?? 0, metadataJson: JSON.stringify(input.metadata || {}), ownerUserId: owner ?? null,
      createdAt: reservation.createdAt, estimatedCostUsd: input.estimatedUsd ?? null, reportedCostUsd: input.reportedUsd ?? null,
      costBasis: input.reportedUsd != null ? "reported" : input.estimatedUsd != null ? "estimated" : "unknown",
      inputTokens: input.inputTokens ?? null, outputTokens: input.outputTokens ?? null, reservationId: id });
  });
}

export const AUTOMATION_TASK_IDS = ["monitor_engine", "source_scan", "source_liveness", "queue_worker", "reconciliation", "account_inference"] as const;
export type AutomationTaskId = typeof AUTOMATION_TASK_IDS[number];
export type AutomationTaskStatus = "success" | "failed" | "never" | "running";
export type AutomationTaskSchedule = { id: AutomationTaskId; enabled: boolean; intervalSeconds: number; nextRunAt: number; lastRunAt: number; lastStatus: AutomationTaskStatus; updatedAt: number };
const automationDefaults: Array<{ id: AutomationTaskId; intervalSeconds: number }> = [
  { id: "monitor_engine", intervalSeconds: 15 }, { id: "source_scan", intervalSeconds: 300 }, { id: "source_liveness", intervalSeconds: 86400 },
  { id: "queue_worker", intervalSeconds: 300 }, { id: "reconciliation", intervalSeconds: 300 }, { id: "account_inference", intervalSeconds: 300 },
];

export async function getPostgresAutomationSchedules(now = Math.floor(Date.now() / 1000)) {
  let saved: unknown;
  try { saved = JSON.parse(await getPostgresSetting("automation_schedules", "")); } catch { saved = null; }
  const stored = Array.isArray(saved) ? saved.filter((item): item is AutomationTaskSchedule => Boolean(item && typeof item === "object" && AUTOMATION_TASK_IDS.includes(item.id) && Number.isFinite(item.nextRunAt))) : [];
  const schedules = automationDefaults.map((defaults) => stored.find((item) => item.id === defaults.id) || {
    id: defaults.id, enabled: true, intervalSeconds: defaults.intervalSeconds, nextRunAt: now + defaults.intervalSeconds,
    lastRunAt: 0, lastStatus: "never" as const, updatedAt: now,
  });
  if (schedules.some((item) => !stored.some((prior) => prior.id === item.id))) await setPostgresSetting("automation_schedules", JSON.stringify(schedules), now);
  return schedules;
}

export async function savePostgresAutomationSchedule(input: { id: AutomationTaskId; enabled: boolean; intervalSeconds: number; nextRunAt: number; now: number }) {
  if (!AUTOMATION_TASK_IDS.includes(input.id)) throw new Error("bilinmeyen otomasyon görevi");
  const minimum = input.id === "monitor_engine" ? 15 : 60;
  if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < minimum || input.intervalSeconds > 30 * 86400) throw new Error(`periyot ${minimum} saniye ile 30 gün arasında olmalı`);
  if (!Number.isInteger(input.nextRunAt) || input.nextRunAt <= 0) throw new Error("geçerli sonraki çalışma tarihi gerekli");
  const schedules = (await getPostgresAutomationSchedules(input.now)).map((item) => item.id === input.id
    ? { ...item, enabled: input.enabled, intervalSeconds: input.intervalSeconds, nextRunAt: input.nextRunAt, updatedAt: input.now } : item);
  await setPostgresSetting("automation_schedules", JSON.stringify(schedules), input.now);
  return schedules.find((item) => item.id === input.id)!;
}

export async function getPostgresAutomationLogs(limit = 100) {
  const rows = await getPostgresDb().select().from(automationLogs).orderBy(desc(automationLogs.id)).limit(Math.max(1, Math.min(200, Math.floor(limit))));
  return rows.map((item) => {
    let details: Record<string, unknown> = {};
    try { const parsed: unknown = JSON.parse(item.detailsJson); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) details = parsed as Record<string, unknown>; } catch { /* malformed historic detail */ }
    return { id: item.id, taskId: item.taskId as AutomationTaskId, status: item.status as AutomationTaskStatus,
      startedAt: item.startedAt, finishedAt: item.finishedAt, message: item.message, details };
  });
}

const DEFAULT_ACCOUNT_STYLE = { tone: "sade, kanıt odaklı, kısa", ideology: "belirsiz", opening: "doğrudan başlık", emoji: "kullanma", attribution: "otomatik atıf yazma", formatRule: "tek paragraf, kısa cümle, hashtag yok" };
const DEFAULT_EDITORIAL_INSTRUCTION = "Türkçe X içerik editörüsün. Kısa, olgusal ve özgün yaz; kaynakta olmayan kesinlik ekleme. En güçlü bilgiyi doğrudan ver, clickbait ve şablon ifadeler kullanma.";
const DEFAULT_WRITING_SKILLS = [
  { id: "newsroom-style" as const, name: "newsroom-style", sourceUrl: "https://www.skills.sh/jamditis/claude-skills-journalism/newsroom-style", reviewedRevision: "skills.sh snapshot · 2026-08-30", enabled: true, instructions: "Haberi kısa, doğrudan ve olgu odaklı kur. En önemli bilgiyle başla; gereksiz sıfat, tekrar ve clickbait kullanma. Kaynaktaki belirsizliği kesin bilgiye çevirme." },
  { id: "humanize-writing" as const, name: "humanize-writing", sourceUrl: "https://www.skills.sh/leo1oel/leo-agent-skills/humanize-writing", reviewedRevision: "skills.sh snapshot · 2026-08-30", enabled: true, instructions: "Kaynak olgularını ve belirsizliğini koru; metni doğal, özgün Türkçe ile baştan kur. Cümle yapısını veya kelime dizisini kaynak metinden kopyalama. Yapay zekâ klişeleri, şablon geçişler ve gereksiz önem vurgusunu temizle." },
];
function skillIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.filter((id): id is string => id === "newsroom-style" || id === "humanize-writing"))];
  return ids.length === value.length ? ids : null;
}
export async function getPostgresWritingStyleSettings() {
  let parsed: unknown;
  try { parsed = JSON.parse(await getPostgresSetting("writing_style_settings", "")); } catch { parsed = null; }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const storedSkills = Array.isArray(record.skills) ? record.skills : [];
  const skills = DEFAULT_WRITING_SKILLS.map((defaults) => {
    const stored = storedSkills.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === defaults.id) as Record<string, unknown> | undefined;
    return { ...defaults, enabled: stored?.enabled !== false,
      instructions: typeof stored?.instructions === "string" && stored.instructions.trim() ? stored.instructions.trim().slice(0, 6000) : defaults.instructions };
  });
  const rawExample = record.exampleStyle && typeof record.exampleStyle === "object" && !Array.isArray(record.exampleStyle) ? record.exampleStyle as Record<string, unknown> : {};
  const editorial = typeof rawExample.editorialInstruction === "string" && rawExample.editorialInstruction.trim().length <= 6000 ? rawExample.editorialInstruction.trim() : DEFAULT_EDITORIAL_INSTRUCTION;
  return { exampleStyle: { ...DEFAULT_ACCOUNT_STYLE, ...rawExample, editorialInstruction: editorial,
    writingSkillIds: skillIds(rawExample.writingSkillIds) || skills.filter((skill) => skill.enabled).map((skill) => skill.id),
    attribution: "özel haber etiketi varsa görünür kaynak adı; aksi halde otomatik atıf yok" }, skills };
}
export async function savePostgresWritingStyleSettings(input: { exampleStyle: Record<string, unknown>; skills: Array<{ id: string; enabled?: boolean; instructions?: string }> }, now = Math.floor(Date.now() / 1000)) {
  const existing = await getPostgresWritingStyleSettings();
  const requested = new Map((input.skills || []).filter((item) => item.id === "newsroom-style" || item.id === "humanize-writing").map((item) => [item.id, item]));
  const skills = existing.skills.map((skill) => {
    const value = requested.get(skill.id);
    const instructions = typeof value?.instructions === "string" ? value.instructions.trim() : skill.instructions;
    if (!instructions || instructions.length > 6000) throw new Error(`${skill.name} için 1-6000 karakter arası yönerge gerekli`);
    return { ...skill, enabled: value?.enabled !== false, instructions };
  });
  const exampleStyle = { ...DEFAULT_ACCOUNT_STYLE, ...input.exampleStyle,
    editorialInstruction: typeof input.exampleStyle.editorialInstruction === "string" ? input.exampleStyle.editorialInstruction.trim() : DEFAULT_EDITORIAL_INSTRUCTION,
    writingSkillIds: skillIds(input.exampleStyle.writingSkillIds) || [],
    attribution: "özel haber etiketi varsa görünür kaynak adı; aksi halde otomatik atıf yok" };
  if (String(exampleStyle.editorialInstruction).length > 6000) throw new Error("editoryal yönerge en fazla 6000 karakter olabilir");
  const value = { exampleStyle, skills };
  await setPostgresSetting("writing_style_settings", JSON.stringify(value), now);
  return value;
}
