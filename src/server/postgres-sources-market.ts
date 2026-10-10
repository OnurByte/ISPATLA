import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getPostgresDb } from "@/server/postgres";
import { accounts, drafts } from "@/server/postgres-schema";
import { accountSourceCategories, accountSources, competitors, observedPosts, sources } from "@/server/postgres-sources-schema";
import type { BlueCheckStatus, Competitor, MarketInbox, MarketItem, MarketView, SourceCategoryConfig, SourceConfig, SourceProfile } from "@/server/db-types";

function json<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }
function object(value: unknown): SourceProfile { return value && typeof value === "object" && !Array.isArray(value) ? value as SourceProfile : {}; }
function cleanHandle(value: string) { return value.replace(/^@/, "").trim().toLowerCase(); }
function blueCheck(value: string): BlueCheckStatus { return ["blue", "organization", "government", "not_verified", "unknown"].includes(value) ? value as BlueCheckStatus : "unknown"; }
function selectedSource(row: typeof accountSources.$inferSelect, canonical: typeof sources.$inferSelect): SourceConfig {
  const topics = json<unknown>(row.topicsJson, []);
  return { handle: canonical.handle, name: row.nameOverride || canonical.name, enabled: row.enabled === 1, maxPosts: row.maxPosts,
    rightsStatus: row.rightsStatus === "cleared" || row.rightsStatus === "prohibited" ? row.rightsStatus : "unknown",
    profile: { ...object(json(canonical.profileJson, {})), niche: row.niche || undefined, topics: Array.isArray(topics) ? topics.filter((item): item is string => typeof item === "string") : undefined,
      tone: row.tone || undefined, pinned: row.pinned === 1 } };
}

async function ownsAccount(owner: string, accountId: number) {
  return Boolean((await getPostgresDb().select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, owner))).limit(1))[0]);
}

export async function getPostgresAccountSources(owner: string, accountId: number): Promise<SourceConfig[]> {
  if (!await ownsAccount(owner, accountId)) throw new Error("account not found");
  const rows = await getPostgresDb().select({ selected: accountSources, canonical: sources }).from(accountSources)
    .innerJoin(sources, eq(accountSources.sourceHandle, sources.handle)).innerJoin(accounts, eq(accounts.id, accountSources.accountId))
    .where(and(eq(accounts.ownerUserId, owner), eq(accountSources.accountId, accountId))).orderBy(asc(accountSources.nameOverride), asc(sources.handle));
  return rows.map(({ selected, canonical }) => selectedSource(selected, canonical));
}

export async function savePostgresAccountSource(owner: string, input: { accountId: number; handle: string; name?: string; enabled?: boolean; maxPosts?: number; rightsStatus?: SourceConfig["rightsStatus"]; niche?: string; topics?: string[]; tone?: string; pinned?: boolean }) {
  const handle = cleanHandle(input.handle), now = Math.floor(Date.now() / 1000);
  if (!await ownsAccount(owner, input.accountId)) throw new Error("account not found");
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("invalid source handle");
  if (input.maxPosts !== undefined && (!Number.isInteger(input.maxPosts) || input.maxPosts < 1 || input.maxPosts > 50)) throw new Error("max posts invalid");
  if (input.name !== undefined && (!input.name.trim() || input.name.length > 120)) throw new Error("source name invalid");
  if (input.rightsStatus !== undefined && !["cleared", "unknown", "prohibited"].includes(input.rightsStatus)) throw new Error("source rights invalid");
  const topics = input.topics?.map((value) => value.trim()).filter(Boolean).slice(0, 30);
  const db = getPostgresDb();
  await db.transaction(async (tx) => {
    await tx.insert(sources).values({ handle, name: (input.name || handle).trim().slice(0, 120), enabled: 1, maxPosts: input.maxPosts || 20, rightsStatus: "unknown", profileJson: JSON.stringify({ origin: "manual", status: "active", pinned: true }), updatedAt: now }).onConflictDoNothing();
    await tx.insert(accountSources).values({ accountId: input.accountId, sourceHandle: handle, enabled: input.enabled === false ? 0 : 1,
      maxPosts: input.maxPosts || 20, rightsStatus: input.rightsStatus || "unknown", nameOverride: input.name?.trim().slice(0, 120) || "",
      niche: input.niche?.trim().slice(0, 120) || "", topicsJson: JSON.stringify(topics || []), tone: input.tone?.trim().slice(0, 120) || "", pinned: input.pinned === false ? 0 : 1 })
      .onConflictDoUpdate({ target: [accountSources.accountId, accountSources.sourceHandle], set: {
        ...(input.name !== undefined ? { nameOverride: input.name.trim().slice(0, 120) } : {}), ...(input.enabled !== undefined ? { enabled: input.enabled ? 1 : 0 } : {}),
        ...(input.maxPosts !== undefined ? { maxPosts: input.maxPosts } : {}), ...(input.rightsStatus !== undefined ? { rightsStatus: input.rightsStatus } : {}),
        ...(input.niche !== undefined ? { niche: input.niche.trim().slice(0, 120) } : {}), ...(topics !== undefined ? { topicsJson: JSON.stringify(topics) } : {}),
        ...(input.tone !== undefined ? { tone: input.tone.trim().slice(0, 120) } : {}), ...(input.pinned !== undefined ? { pinned: input.pinned ? 1 : 0 } : {}),
      } });
  });
  return (await getPostgresAccountSources(owner, input.accountId)).find((row) => row.handle === handle) || null;
}

export async function removePostgresAccountSource(owner: string, accountId: number, handle: string) {
  if (!await ownsAccount(owner, accountId)) throw new Error("account not found");
  await getPostgresDb().delete(accountSources).where(and(eq(accountSources.accountId, accountId), eq(accountSources.sourceHandle, cleanHandle(handle))));
}
export async function clearPostgresAccountSources(owner: string, accountId: number) {
  if (!await ownsAccount(owner, accountId)) throw new Error("account not found");
  await getPostgresDb().delete(accountSources).where(eq(accountSources.accountId, accountId));
}

export async function getPostgresSourceCategoryConfigs(owner: string, accountId: number, handle: string): Promise<SourceCategoryConfig[]> {
  if (!await ownsAccount(owner, accountId)) throw new Error("account not found");
  const rows = await getPostgresDb().execute(sql`SELECT mapping.account_id,mapping.source_handle,mapping.category_id,c.slug,c.name,mapping.monitoring_tier,
      mapping.discovery_weight,mapping.category_reputation,mapping.enabled,mapping.last_evidence_at
    FROM ispatla_app.account_source_categories mapping
    JOIN ispatla_app.account_sources selected ON selected.account_id=mapping.account_id AND selected.source_handle=mapping.source_handle
    JOIN ispatla_app.categories c ON c.id=mapping.category_id
    WHERE mapping.account_id=${accountId} AND mapping.source_handle=${cleanHandle(handle)} AND (c.owner_user_id=${owner} OR c.owner_user_id IS NULL)
    ORDER BY mapping.enabled DESC,mapping.monitoring_tier ASC,c.slug ASC`) as unknown as { rows: Array<Record<string, unknown>> };
  return rows.rows.map((row) => ({ accountId: Number(row.account_id), sourceHandle: String(row.source_handle), categoryId: Number(row.category_id), categorySlug: String(row.slug), categoryName: String(row.name),
    monitoringTier: row.monitoring_tier === "A" || row.monitoring_tier === "B" ? row.monitoring_tier : "C", discoveryWeight: Number(row.discovery_weight),
    categoryReputation: row.category_reputation === null ? null : Number(row.category_reputation), enabled: Number(row.enabled) === 1, lastEvidenceAt: Number(row.last_evidence_at) }));
}

export async function savePostgresSourceCategoryConfig(owner: string, input: { accountId: number; sourceHandle: string; categoryId: number; monitoringTier: "A" | "B" | "C"; discoveryWeight: number; categoryReputation: number | null; enabled: boolean; lastEvidenceAt: number }) {
  if (!await ownsAccount(owner, input.accountId)) throw new Error("account not found");
  const handle = cleanHandle(input.sourceHandle);
  if (!Number.isInteger(input.categoryId) || input.categoryId < 1 || !["A", "B", "C"].includes(input.monitoringTier)
    || !Number.isFinite(input.discoveryWeight) || input.discoveryWeight < 0 || input.discoveryWeight > 10
    || (input.categoryReputation !== null && (!Number.isFinite(input.categoryReputation) || input.categoryReputation < 0 || input.categoryReputation > 100))
    || !Number.isInteger(input.lastEvidenceAt) || input.lastEvidenceAt < 0) throw new Error("source category config invalid");
  const valid = await getPostgresDb().execute(sql`SELECT 1 FROM ispatla_app.account_sources selected
    JOIN ispatla_app.account_categories ac ON ac.account_id=selected.account_id AND ac.category_id=${input.categoryId} AND ac.enabled=1
    JOIN ispatla_app.categories c ON c.id=ac.category_id AND (c.owner_user_id=${owner} OR c.owner_user_id IS NULL)
    WHERE selected.account_id=${input.accountId} AND selected.source_handle=${handle} LIMIT 1`);
  if (!(valid as unknown as { rows: unknown[] }).rows.length) throw new Error("source or category not available to account");
  await getPostgresDb().insert(accountSourceCategories).values({ accountId: input.accountId, sourceHandle: handle, categoryId: input.categoryId,
    monitoringTier: input.monitoringTier, discoveryWeight: input.discoveryWeight, categoryReputation: input.categoryReputation, enabled: input.enabled ? 1 : 0, lastEvidenceAt: input.lastEvidenceAt })
    .onConflictDoUpdate({ target: [accountSourceCategories.accountId, accountSourceCategories.sourceHandle, accountSourceCategories.categoryId], set: {
      monitoringTier: input.monitoringTier, discoveryWeight: input.discoveryWeight, categoryReputation: input.categoryReputation, enabled: input.enabled ? 1 : 0, lastEvidenceAt: input.lastEvidenceAt,
    } });
  return (await getPostgresSourceCategoryConfigs(owner, input.accountId, handle)).find((item) => item.categoryId === input.categoryId) || null;
}

export async function deletePostgresSourceCategoryConfig(owner: string, accountId: number, handle: string, categoryId: number) {
  if (!await ownsAccount(owner, accountId)) throw new Error("account not found");
  await getPostgresDb().delete(accountSourceCategories).where(and(eq(accountSourceCategories.accountId, accountId), eq(accountSourceCategories.sourceHandle, cleanHandle(handle)), eq(accountSourceCategories.categoryId, categoryId)));
}

function competitorView(row: typeof competitors.$inferSelect): Competitor {
  return { id: row.id, handle: row.handle, name: row.name, category: row.category, enabled: row.enabled === 1, initializedAt: row.initializedAt,
    lastSuccessAt: row.lastSuccessAt, lastError: row.lastError, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
export async function getPostgresCompetitors(owner: string) {
  return (await getPostgresDb().select().from(competitors).where(eq(competitors.ownerUserId, owner)).orderBy(desc(competitors.enabled), asc(competitors.handle))).map(competitorView);
}
export async function savePostgresCompetitor(owner: string, input: { handle: string; name?: string; category?: string; enabled?: boolean; now: number }) {
  const handle = cleanHandle(input.handle);
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("geçerli 𝕏 handle gerekli");
  const [row] = await getPostgresDb().insert(competitors).values({ ownerUserId: owner, handle, name: (input.name || handle).trim().slice(0, 120), category: (input.category || "").trim().slice(0, 240), enabled: input.enabled === false ? 0 : 1, createdAt: input.now, updatedAt: input.now })
    .onConflictDoUpdate({ target: [competitors.ownerUserId, competitors.handle], set: { name: (input.name || handle).trim().slice(0, 120), category: (input.category || "").trim().slice(0, 240), enabled: input.enabled === false ? 0 : 1, updatedAt: input.now } }).returning();
  return competitorView(row);
}
export async function deletePostgresCompetitor(owner: string, id: number) {
  return (await getPostgresDb().delete(competitors).where(and(eq(competitors.id, id), eq(competitors.ownerUserId, owner))).returning({ id: competitors.id })).length > 0;
}

const EMPTY_COUNTS = { opportunities: 0, observed: 0, rejected: 0, sensitive: 0 };
export async function getPostgresMarketInbox(owner: string, input: { view?: MarketView; limit?: number; offset?: number; now?: number } = {}): Promise<MarketInbox & { scanAvailable: false }> {
  const view = input.view || "opportunities", limit = Math.max(1, Math.min(100, Math.floor(input.limit || 50))), offset = Math.max(0, Math.floor(input.offset || 0)), now = input.now || Math.floor(Date.now() / 1000);
  const ownedAccounts = await getPostgresDb().select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerUserId, owner));
  const accountIds = ownedAccounts.map((row) => row.id);
  if (!accountIds.length) return { items: [], total: 0, counts: EMPTY_COUNTS, scanAvailable: false };
  const ownerDrafts = await getPostgresDb().select({ externalId: drafts.externalId, status: drafts.status }).from(drafts).where(and(eq(drafts.ownerUserId, owner), inArray(drafts.accountId, accountIds)));
  const drafted = new Map<string, string>();
  for (const row of ownerDrafts) if (row.externalId) drafted.set(row.externalId, row.status);
  const posts = await getPostgresDb().select().from(observedPosts).where(gte(observedPosts.observedAt, now - 86_400)).orderBy(desc(observedPosts.observedAt), asc(observedPosts.id)).limit(1000);
  // Scanner ingestion is currently paused. Do not synthesize a market from stale local state.
  const items = posts.map((post) => {
    const age = Math.max(0, now - post.createdTimestamp), engagements = post.likes + post.replies + post.reposts + post.quotes;
    const decision = post.sensitive === 1 ? "sensitive" as const : post.score >= 70 ? "opportunity" as const : "below_threshold" as const;
    const ownDraftStatus = drafted.get(post.externalId), marketStatus = ownDraftStatus === "queued" ? "queued" as const : ownDraftStatus ? "drafted" as const : "new" as const;
    const scoreEvidence = { kind: "deterministic" as const, momentum: Math.round(post.score), ai: 0, risk: post.sensitive ? 100 : 0, confidence: 0,
      model: "postgres-observation", reason: post.scoreReason, categories: [], breaking: false, breakingReason: "" };
    return { externalId: post.externalId, sourceHandle: post.sourceHandle, authorHandle: post.authorHandle, statusUrl: post.statusUrl, text: post.text,
      observedAt: post.observedAt, draftText: "", draftStatus: ownDraftStatus || "not_started",
      publishStatus: "not_started", createdTimestamp: post.createdTimestamp, likes: post.likes, replies: post.replies, reposts: post.reposts, quotes: post.quotes,
      views: post.views, followers: post.authorFollowers, blueCheckStatus: blueCheck(post.authorBlueCheckStatus),
      mediaCount: post.mediaCount, mediaJson: post.mediaJson, score: post.score, scoreReason: post.scoreReason, sensitive: post.sensitive === 1,
      clusterKey: post.clusterKey, relevanceScore: post.relevanceScore, relevanceSource: post.relevanceSource, relevanceJson: post.relevanceJson, relevanceAt: post.relevanceAt,
      momentum: Math.round(post.score), freshness: Math.max(0, Math.round(100 * (1 - age / 86_400))), velocity: Math.round(engagements / Math.max(1, age / 3600)),
      relevance: post.relevanceScore || 0, risk: post.sensitive ? 100 : 0, engagementRate: post.authorFollowers > 0 ? engagements / post.authorFollowers : 0, engagements, hit: false,
      marketStatus, decision, scoreEvidence, jevRelevance: post.relevanceScore, jevRelevanceFactor: 1, jevRelevanceSource: post.relevanceSource || "", jevRelevanceAt: post.relevanceAt || 0, jevRelevanceApplied: false,
    } satisfies MarketItem;
  }).filter((item) => view === "sensitive" ? item.decision === "sensitive" : view === "rejected" ? ["below_threshold", "expired", "not_eligible_evidence"].includes(item.decision) : view === "opportunities" ? item.decision === "opportunity" : item.decision !== "sensitive");
  const all = posts.map((post) => post.sensitive === 1 ? "sensitive" : post.score >= 70 ? "opportunity" : "rejected");
  const counts = { opportunities: all.filter((item) => item === "opportunity").length, observed: all.filter((item) => item !== "sensitive").length,
    rejected: all.filter((item) => item === "rejected").length, sensitive: all.filter((item) => item === "sensitive").length };
  return { items: items.slice(offset, offset + limit), total: items.length, counts, scanAvailable: false };
}
