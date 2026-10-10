import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getPostgresDb } from "@/server/postgres";
import { accountCategories, accounts, categories } from "@/server/postgres-schema";

const DEFAULT_STYLE = { tone: "sade, kanıt odaklı, kısa", ideology: "belirsiz", opening: "doğrudan başlık", emoji: "kullanma", attribution: "otomatik atıf yazma", formatRule: "tek paragraf, kısa cümle, hashtag yok" };
const BASE = ["news", "politics", "technology", "finance", "sports", "entertainment", "meme", "shitpost", "generic"] as const;
const CLUSTER = ["event", "topic", "meme", "conversation", "format", "hybrid"] as const;
const VERIFICATION = ["strict", "moderate", "minimal", "none"] as const;

export type PgCategory = {
  id: number; slug: string; name: string; enabled: boolean; builtIn: boolean; baseStrategy: typeof BASE[number];
  clusterStrategy: typeof CLUSTER[number]; verificationMode: typeof VERIFICATION[number]; description: string;
  positiveExamples: string[]; negativeExamples: string[]; keywords: string[]; excludedKeywords: string[]; seedHandles: string[];
  defaultFormats: string[]; sourcePolicy: Record<string, unknown>; riskPolicy: Record<string, unknown>;
  scoringPolicy: Record<string, unknown>; publishingPolicy: Record<string, unknown>; aiContext: string;
  createdAt: number; updatedAt: number; ownerUserId: string | null; accountId: number | null;
};

function json<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown, limit = 50): string[] { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, limit) : []; }
export function mapPostgresCategory(row: typeof categories.$inferSelect): PgCategory {
  return { id: row.id, slug: row.slug, name: row.name, enabled: row.enabled === 1, builtIn: row.builtIn === 1,
    baseStrategy: row.baseStrategy as PgCategory["baseStrategy"], clusterStrategy: row.clusterStrategy as PgCategory["clusterStrategy"],
    verificationMode: row.verificationMode as PgCategory["verificationMode"], description: row.description,
    positiveExamples: json(row.positiveExamplesJson, []), negativeExamples: json(row.negativeExamplesJson, []),
    keywords: json(row.keywordsJson, []), excludedKeywords: json(row.excludedKeywordsJson, []), seedHandles: json(row.seedHandlesJson, []),
    defaultFormats: json(row.defaultFormatsJson, ["post"]), sourcePolicy: json(row.sourcePolicyJson, {}), riskPolicy: json(row.riskPolicyJson, {}),
    scoringPolicy: json(row.scoringPolicyJson, {}), publishingPolicy: json(row.publishingPolicyJson, {}), aiContext: row.aiContext,
    createdAt: row.createdAt, updatedAt: row.updatedAt, ownerUserId: row.ownerUserId, accountId: row.accountId };
}

export async function getPostgresAccounts(owner: string) {
  const rows = await getPostgresDb().select().from(accounts).where(eq(accounts.ownerUserId, owner)).orderBy(desc(accounts.defaultAccount), accounts.handle);
  return rows.map(accountView);
}

function accountView(row: typeof accounts.$inferSelect) {
  return { id: row.id, ownerUserId: row.ownerUserId, accountKey: row.accountKey, handle: row.handle,
    displayName: row.displayName, enabled: row.enabled, defaultAccount: row.defaultAccount, automationMode: row.automationMode as "manual" | "auto",
    dailyLimit: row.dailyLimit, capabilities: json(row.capabilitiesJson, [] as string[]), styleProfile: { ...DEFAULT_STYLE, ...json(row.styleProfileJson, {}) },
    subscriptionHistory: [], subscriptionState: { tier: "unknown" as const, observedAt: 0, historyComplete: false },
    publicVerificationStatus: "unknown" as const, updatedAt: row.updatedAt };
}

export async function getPostgresAccount(owner: string, id: number) {
  return (await getPostgresAccounts(owner)).find((account) => account.id === id) || null;
}

export async function updatePostgresAccount(input: { owner: string; id: number; enabled: boolean; defaultAccount: boolean; dailyLimit: number; capabilities: string[]; styleProfile: Record<string, unknown> }) {
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    if (input.defaultAccount) await tx.update(accounts).set({ defaultAccount: false }).where(eq(accounts.ownerUserId, input.owner));
    const [row] = await tx.update(accounts).set({ enabled: input.enabled, defaultAccount: input.defaultAccount,
      dailyLimit: input.dailyLimit, capabilitiesJson: JSON.stringify(input.capabilities), styleProfileJson: JSON.stringify(input.styleProfile),
      updatedAt: Math.floor(Date.now() / 1000) }).where(and(eq(accounts.id, input.id), eq(accounts.ownerUserId, input.owner))).returning();
    return row ? accountView(row) : null;
  });
}

export async function deletePostgresAccount(owner: string, id: number): Promise<boolean> {
  const deleted = await getPostgresDb().delete(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerUserId, owner))).returning({ id: accounts.id });
  return deleted.length > 0;
}

export async function getPostgresCategoriesForAccount(owner: string, accountId: number): Promise<PgCategory[]> {
  const owns = await getPostgresDb().select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, owner))).limit(1);
  if (!owns.length) throw new Error("account bulunamadı");
  const rows = await getPostgresDb().select().from(categories).where(and(or(isNull(categories.ownerUserId), eq(categories.ownerUserId, owner)), or(isNull(categories.accountId), eq(categories.accountId, accountId)))).orderBy(categories.name);
  return rows.map(mapPostgresCategory);
}

export async function getPostgresCategoryConfigs(owner: string, accountId: number) {
  const rows = await getPostgresDb().select({ mapping: accountCategories, category: categories }).from(accountCategories)
    .innerJoin(accounts, eq(accounts.id, accountCategories.accountId)).innerJoin(categories, eq(categories.id, accountCategories.categoryId))
    .where(and(eq(accounts.ownerUserId, owner), eq(accountCategories.accountId, accountId)))
    .orderBy(desc(accountCategories.isPrimary), desc(accountCategories.priority), categories.slug);
  return rows.map(({ mapping, category: cat }) => ({ accountId: mapping.accountId, categoryId: mapping.categoryId, categorySlug: cat.slug,
    categoryName: cat.name, enabled: mapping.enabled === 1 && cat.enabled === 1, primary: mapping.isPrimary === 1, weight: mapping.weight, priority: mapping.priority,
    publishThreshold: mapping.publishThreshold, dailyBudget: mapping.dailyBudget,
    styleOverride: json(mapping.styleOverrideJson, {}), aiRouteOverride: json(mapping.aiRouteOverrideJson, {}),
    source: mapping.source as "manual" | "inferred" | "imported", userModifiedAt: mapping.userModifiedAt }));
}

export async function savePostgresCategoryConfig(owner: string, input: { accountId: number; categoryId: number; enabled: boolean; primary: boolean; weight: number; priority: number; publishThreshold: number | null; dailyBudget: number | null; styleOverride: unknown; aiRouteOverride: unknown }) {
  if (input.primary && !input.enabled) throw new Error("primary category etkin olmalı");
  if (!Number.isFinite(input.weight) || input.weight < 0 || input.weight > 10 || !Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100
    || (input.publishThreshold !== null && (!Number.isFinite(input.publishThreshold) || input.publishThreshold < 0 || input.publishThreshold > 100))
    || (input.dailyBudget !== null && (!Number.isInteger(input.dailyBudget) || input.dailyBudget < 1 || input.dailyBudget > 100))) throw new Error("category config geçersiz");
  const db = getPostgresDb();
  await db.transaction(async (tx) => {
    const [valid] = await tx.select({ accountId: accounts.id }).from(accounts).innerJoin(categories, eq(categories.id, input.categoryId))
      .where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, owner), or(isNull(categories.accountId), eq(categories.accountId, input.accountId)), or(isNull(categories.ownerUserId), eq(categories.ownerUserId, owner)))).limit(1);
    if (!valid) throw new Error("category/account owner mismatch");
    if (input.primary) await tx.update(accountCategories).set({ isPrimary: 0 }).where(eq(accountCategories.accountId, input.accountId));
    await tx.insert(accountCategories).values({ accountId: input.accountId, categoryId: input.categoryId, enabled: input.enabled ? 1 : 0,
      isPrimary: input.primary ? 1 : 0, weight: input.weight, priority: input.priority, publishThreshold: input.publishThreshold,
      dailyBudget: input.dailyBudget, styleOverrideJson: JSON.stringify(object(input.styleOverride)), aiRouteOverrideJson: JSON.stringify(object(input.aiRouteOverride)),
      source: "manual", userModifiedAt: Math.floor(Date.now() / 1000) }).onConflictDoUpdate({ target: [accountCategories.accountId, accountCategories.categoryId], set: {
      enabled: input.enabled ? 1 : 0, isPrimary: input.primary ? 1 : 0, weight: input.weight, priority: input.priority,
      publishThreshold: input.publishThreshold, dailyBudget: input.dailyBudget, styleOverrideJson: JSON.stringify(object(input.styleOverride)),
      aiRouteOverrideJson: JSON.stringify(object(input.aiRouteOverride)), source: "manual", userModifiedAt: Math.floor(Date.now() / 1000),
    } });
  });
  const saved = (await getPostgresCategoryConfigs(owner, input.accountId)).find((config) => config.categoryId === input.categoryId);
  if (!saved) throw new Error("account category kaydedilemedi");
  return saved;
}

export async function savePostgresAccountCategory(owner: string, accountId: number, input: Omit<PgCategory, "id" | "createdAt" | "updatedAt" | "ownerUserId" | "accountId"> & { id?: number; now: number }): Promise<PgCategory> {
  if (input.builtIn) throw new Error("built-in categories are read-only");
  const slug = (input.slug.startsWith(`account-${accountId}-`) ? input.slug : `account-${accountId}-${input.slug}`).trim().toLowerCase();
  const name = input.name.trim().slice(0, 120), description = input.description.trim().slice(0, 2_000);
  const positiveExamples = strings(input.positiveExamples, 20), negativeExamples = strings(input.negativeExamples, 20), keywords = strings(input.keywords),
    excludedKeywords = strings(input.excludedKeywords), seedHandles = strings(input.seedHandles.map((h) => h.replace(/^@/, "").toLowerCase())), defaultFormats = strings(input.defaultFormats, 8);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !name || !description || !(BASE as readonly string[]).includes(input.baseStrategy)
    || !(CLUSTER as readonly string[]).includes(input.clusterStrategy) || !(VERIFICATION as readonly string[]).includes(input.verificationMode)
    || (!positiveExamples.length && !negativeExamples.length && !keywords.length && !seedHandles.length)
    || (input.verificationMode === "none" && ["news", "politics", "finance"].includes(input.baseStrategy))) throw new Error("category alanları geçersiz");
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const [owned] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, owner))).limit(1);
    if (!owned) throw new Error("account bulunamadı");
    let existing;
    if (input.id) {
      [existing] = await tx.select().from(categories).where(and(eq(categories.id, input.id), eq(categories.ownerUserId, owner), eq(categories.accountId, accountId), eq(categories.builtIn, 0))).limit(1);
      if (!existing) throw new Error("category owner/account mismatch");
    }
    const values = { slug, name, enabled: input.enabled ? 1 : 0, builtIn: 0, baseStrategy: input.baseStrategy, clusterStrategy: input.clusterStrategy,
      verificationMode: input.verificationMode, description, positiveExamplesJson: JSON.stringify(positiveExamples), negativeExamplesJson: JSON.stringify(negativeExamples),
      keywordsJson: JSON.stringify(keywords), excludedKeywordsJson: JSON.stringify(excludedKeywords), seedHandlesJson: JSON.stringify(seedHandles),
      defaultFormatsJson: JSON.stringify(defaultFormats.length ? defaultFormats : ["post"]), sourcePolicyJson: JSON.stringify(input.sourcePolicy),
      riskPolicyJson: JSON.stringify(input.riskPolicy), scoringPolicyJson: JSON.stringify(input.scoringPolicy), publishingPolicyJson: JSON.stringify(input.publishingPolicy),
      aiContext: input.aiContext.slice(0, 8_000), updatedAt: input.now, ownerUserId: owner, accountId };
    let row;
    if (existing) [row] = await tx.update(categories).set(values).where(eq(categories.id, existing.id)).returning();
    else [row] = await tx.insert(categories).values({ ...values, createdAt: input.now }).returning();
    const [prior] = await tx.select().from(accountCategories).where(and(eq(accountCategories.accountId, accountId), eq(accountCategories.categoryId, row.id))).limit(1);
    const primary = values.enabled === 1 && (!prior || !(await tx.select({ id: accountCategories.categoryId }).from(accountCategories).where(and(eq(accountCategories.accountId, accountId), eq(accountCategories.enabled, 1), eq(accountCategories.isPrimary, 1))).limit(1)).length);
    await tx.insert(accountCategories).values({ accountId, categoryId: row.id, enabled: values.enabled, isPrimary: primary || (prior?.isPrimary === 1 && values.enabled === 1) ? 1 : 0,
      weight: prior?.weight ?? 1, priority: prior?.priority ?? 1, publishThreshold: prior?.publishThreshold ?? null, dailyBudget: prior?.dailyBudget ?? null,
      styleOverrideJson: prior?.styleOverrideJson ?? "{}", aiRouteOverrideJson: prior?.aiRouteOverrideJson ?? "{}", source: "manual", userModifiedAt: input.now })
      .onConflictDoUpdate({ target: [accountCategories.accountId, accountCategories.categoryId], set: { enabled: values.enabled,
        isPrimary: primary || (prior?.isPrimary === 1 && values.enabled === 1) ? 1 : 0, source: "manual", userModifiedAt: input.now } });
    return mapPostgresCategory(row);
  });
}

export async function deletePostgresAccountCategory(owner: string, id: number): Promise<boolean> {
  const rows = await getPostgresDb().delete(categories).where(and(eq(categories.id, id), eq(categories.ownerUserId, owner), eq(categories.builtIn, 0))).returning({ id: categories.id });
  return rows.length > 0;
}

export async function getPostgresCategory(owner: string, accountId: number, id: number): Promise<PgCategory | null> {
  return (await getPostgresCategoriesForAccount(owner, accountId)).find((item) => item.id === id) || null;
}
