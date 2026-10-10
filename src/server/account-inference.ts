import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getPostgresDb } from "./postgres";
import { accounts, accountCategories, accountCategoryInferenceJobs, accountCategoryInferences, categories } from "./postgres-schema";
import { getPostgresAccount, getPostgresCategoriesForAccount, getPostgresCategoryConfigs, savePostgresAccountCategory } from "./postgres-accounts";
import { withOfficialAccount } from "./publisher";
import { OfficialXClient } from "./official-x";
import { currentOwnerId, runAsOwner } from "./owner-context";
import { getPostgresXAccountAuthState } from "./postgres-x-oauth";
import { isAuthenticatedUserDisabled } from "./auth";

type AccountCategoryInferenceResult = InferenceResult;
type AccountCategoryInferenceJob = { id: number; accountId: number; status: string; version: number; updatedAt: number; result: AccountCategoryInferenceResult | null };

export type InferenceCategory = { id: number; slug: string; name: string; keywords: string[]; description: string };
export type InferenceResult = {
  status: "ready" | "insufficient_evidence";
  contentLanguage: string;
  suggestions: Array<{ categoryId: number; slug: string; name: string; confidence: number; evidence: string[] }>;
};
export type AccountInferenceSweepResult = { attempted: number; completed: number; skipped: number; failed: number };

export function normalizeCategoryInferenceSelection(categoryIds: unknown, weights: unknown): { categoryIds: number[]; weights: Record<string, number> } {
  if (!Array.isArray(categoryIds) || categoryIds.some((value) => !Number.isSafeInteger(value) || Number(value) < 1)) throw new Error("Kategori seçimi geçersiz");
  const selected = [...new Set(categoryIds as number[])].slice(0, 12);
  const weightMap = weights && typeof weights === "object" && !Array.isArray(weights)
    ? Object.fromEntries(Object.entries(weights).map(([id, value]) => [id, Number(value)])) : {};
  for (const [id, weight] of Object.entries(weightMap)) {
    if (selected.includes(Number(id)) && (!Number.isFinite(weight) || weight < 0 || weight > 10)) throw new Error("category weight is invalid");
  }
  return { categoryIds: selected, weights: weightMap };
}

const REQUIRED_INFERENCE_SCOPES = ["tweet.read", "users.read"] as const;

function inferenceOwner(): string {
  const current = currentOwnerId();
  if (!current) throw new Error("authenticated owner context required");
  return current;
}

function unpackJob(row: typeof accountCategoryInferenceJobs.$inferSelect): AccountCategoryInferenceJob {
  return { id: row.id, accountId: row.accountId, status: row.status, version: row.version, updatedAt: row.updatedAt,
    result: row.resultJson ? JSON.parse(row.resultJson) as InferenceResult : null };
}

export async function getOwnAccountInference(accountId: number) {
  const owner = inferenceOwner();
  if (!await getPostgresAccount(owner, accountId)) throw new Error("owned X account not found");
  const [job] = await getPostgresDb().select().from(accountCategoryInferenceJobs).where(and(
    eq(accountCategoryInferenceJobs.ownerUserId, owner), eq(accountCategoryInferenceJobs.accountId, accountId)))
    .orderBy(desc(accountCategoryInferenceJobs.version)).limit(1);
  if (!job?.resultJson) return null;
  const result = JSON.parse(job.resultJson) as InferenceResult;
  const pending = await getPostgresDb().select().from(accountCategoryInferences).where(and(
    eq(accountCategoryInferences.jobId, job.id), eq(accountCategoryInferences.ownerUserId, owner),
    eq(accountCategoryInferences.accountId, accountId), isNull(accountCategoryInferences.acceptedAt),
    isNull(accountCategoryInferences.rejectedAt)));
  result.suggestions = result.suggestions.filter((item) => pending.some((row) => row.categoryId === item.categoryId)).map((item) => {
    const row = pending.find((candidate) => candidate.categoryId === item.categoryId)!;
    return { ...item, confidence: row.confidence, evidence: JSON.parse(row.evidenceJson) as string[] };
  });
  return { status: job.status, result, jobId: job.id, updatedAt: job.updatedAt };
}

async function saveAccountInferenceJob(input: { accountId: number; status: "running" | "failed"; now: number; regenerate?: boolean; jobId?: number }) {
  const owner = inferenceOwner();
  if (!Number.isSafeInteger(input.now) || input.now < 0) throw new Error("inference timestamp is invalid");
  const db = getPostgresDb();
  if (input.jobId) {
    const [row] = await db.update(accountCategoryInferenceJobs).set({ status: input.status, updatedAt: input.now })
      .where(and(eq(accountCategoryInferenceJobs.id, input.jobId), eq(accountCategoryInferenceJobs.ownerUserId, owner), eq(accountCategoryInferenceJobs.accountId, input.accountId))).returning();
    if (!row) throw new Error("inference job not found");
    return { ...unpackJob(row), claimed: true };
  }
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, owner))).for("update");
    if (!account) throw new Error("owned X account not found");
    const [latest] = await tx.select().from(accountCategoryInferenceJobs).where(and(eq(accountCategoryInferenceJobs.ownerUserId, owner), eq(accountCategoryInferenceJobs.accountId, input.accountId))).orderBy(desc(accountCategoryInferenceJobs.version)).limit(1);
    if (!input.regenerate && latest && ["ready", "insufficient_evidence"].includes(latest.status)) return { ...unpackJob(latest), claimed: false };
    if (!input.regenerate && latest?.status === "running" && latest.updatedAt > input.now - 300) return { ...unpackJob(latest), claimed: false };
    const [created] = await tx.insert(accountCategoryInferenceJobs).values({ ownerUserId: owner, accountId: input.accountId,
      version: (latest?.version || 0) + 1, status: "running", resultJson: null, createdAt: input.now, updatedAt: input.now }).returning();
    return { ...unpackJob(created), claimed: true };
  });
}

async function saveAccountInferenceSuggestions(input: { accountId: number; jobId: number; result: InferenceResult; now: number }) {
  const owner = inferenceOwner();
  await getPostgresDb().transaction(async (tx) => {
    const [job] = await tx.select().from(accountCategoryInferenceJobs).where(and(eq(accountCategoryInferenceJobs.id, input.jobId),
      eq(accountCategoryInferenceJobs.ownerUserId, owner), eq(accountCategoryInferenceJobs.accountId, input.accountId))).for("update");
    if (!job || job.status !== "running") throw new Error("inference job is not claimable");
    const categoryRows = await tx.select().from(categories).where(and(or(isNull(categories.ownerUserId), eq(categories.ownerUserId, owner)),
      or(isNull(categories.accountId), eq(categories.accountId, input.accountId))));
    for (const suggestion of input.result.suggestions) {
      if (!categoryRows.some((category) => category.id === suggestion.categoryId && category.slug === suggestion.slug)) throw new Error("suggested category is unavailable");
      await tx.insert(accountCategoryInferences).values({ jobId: input.jobId, ownerUserId: owner, accountId: input.accountId,
        categoryId: suggestion.categoryId, confidence: suggestion.confidence, evidenceJson: JSON.stringify(suggestion.evidence),
        inferenceVersion: job.version, suggestedAt: input.now }).onConflictDoNothing();
    }
    await tx.update(accountCategoryInferenceJobs).set({ status: input.result.status, resultJson: JSON.stringify(input.result), updatedAt: input.now })
      .where(and(eq(accountCategoryInferenceJobs.id, input.jobId), eq(accountCategoryInferenceJobs.ownerUserId, owner), eq(accountCategoryInferenceJobs.accountId, input.accountId)));
  });
}

/** Accepts only categories from the latest owner-scoped inference and keeps manual primary choices intact. */
export async function acceptAccountCategoryInference(input: {
  accountId: number; categoryIds: number[]; weights?: Record<string, number>; now: number;
}) {
  const owner = inferenceOwner();
  if (!Number.isSafeInteger(input.accountId) || input.accountId < 1 || !Number.isSafeInteger(input.now) || input.now < 0) throw new Error("account inference input is invalid");
  const selected = [...new Set(input.categoryIds)].slice(0, 12);
  if (selected.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("category selection is invalid");
  for (const [id, weight] of Object.entries(input.weights || {})) {
    if (selected.includes(Number(id)) && (!Number.isFinite(weight) || weight < 0 || weight > 10)) throw new Error("category weight is invalid");
  }
  const db = getPostgresDb();
  await db.transaction(async (tx) => {
    const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, owner))).for("update");
    if (!account) throw new Error("owned X account not found");
    const [latest] = await tx.select().from(accountCategoryInferenceJobs).where(and(
      eq(accountCategoryInferenceJobs.ownerUserId, owner), eq(accountCategoryInferenceJobs.accountId, input.accountId),
      inArray(accountCategoryInferenceJobs.status, ["ready", "insufficient_evidence"])))
      .orderBy(desc(accountCategoryInferenceJobs.version)).limit(1);
    if (!latest) throw new Error("no category suggestions are ready");
    const valid = await tx.select({ categoryId: accountCategoryInferences.categoryId }).from(accountCategoryInferences).where(and(
      eq(accountCategoryInferences.jobId, latest.id), eq(accountCategoryInferences.ownerUserId, owner),
      eq(accountCategoryInferences.accountId, input.accountId), isNull(accountCategoryInferences.rejectedAt)));
    const validIds = new Set(valid.map((row) => row.categoryId));
    const catalog = await tx.select().from(categories).where(and(eq(categories.enabled, 1),
      or(isNull(categories.ownerUserId), eq(categories.ownerUserId, owner)), or(isNull(categories.accountId), eq(categories.accountId, input.accountId))));
    const availableIds = new Set(catalog.map((row) => row.id));
    if (!selected.every((id) => availableIds.has(id))) throw new Error("selected category is unavailable");
    const [primary] = await tx.select().from(accountCategories).where(and(eq(accountCategories.accountId, input.accountId), eq(accountCategories.isPrimary, 1))).limit(1);
    const preservePrimary = Boolean(primary && (primary.source !== "inferred" || primary.userModifiedAt !== null));
    if (!preservePrimary) await tx.update(accountCategories).set({ isPrimary: 0 }).where(and(eq(accountCategories.accountId, input.accountId),
      eq(accountCategories.source, "inferred"), isNull(accountCategories.userModifiedAt)));
    let primaryAssigned = preservePrimary;
    for (let index = 0; index < selected.length; index += 1) {
      const categoryId = selected[index]!;
      const [existing] = await tx.select().from(accountCategories).where(and(eq(accountCategories.accountId, input.accountId), eq(accountCategories.categoryId, categoryId))).limit(1);
      const inferred = validIds.has(categoryId);
      const weight = Number(input.weights?.[String(categoryId)] ?? 1);
      const makePrimary = !primaryAssigned && (!existing || (existing.source === "inferred" && existing.userModifiedAt === null));
      if (!existing) {
        await tx.insert(accountCategories).values({ accountId: input.accountId, categoryId, enabled: 1, isPrimary: makePrimary ? 1 : 0,
          weight, priority: selected.length - index, source: inferred ? "inferred" : "manual", userModifiedAt: inferred ? null : input.now,
          styleOverrideJson: "{}", aiRouteOverrideJson: "{}" });
      } else if (existing.source === "inferred" && existing.userModifiedAt === null) {
        await tx.update(accountCategories).set({ isPrimary: makePrimary || (preservePrimary && primary?.categoryId === categoryId) ? 1 : 0,
          priority: selected.length - index, weight }).where(and(eq(accountCategories.accountId, input.accountId), eq(accountCategories.categoryId, categoryId),
          eq(accountCategories.source, "inferred"), isNull(accountCategories.userModifiedAt)));
      }
      if (makePrimary) primaryAssigned = true;
      await tx.update(accountCategoryInferences).set({ acceptedAt: input.now }).where(and(eq(accountCategoryInferences.jobId, latest.id),
        eq(accountCategoryInferences.categoryId, categoryId), eq(accountCategoryInferences.ownerUserId, owner), eq(accountCategoryInferences.accountId, input.accountId), isNull(accountCategoryInferences.acceptedAt)));
    }
    for (const categoryId of validIds) {
      if (selected.includes(categoryId)) continue;
      await tx.update(accountCategoryInferences).set({ rejectedAt: input.now }).where(and(eq(accountCategoryInferences.jobId, latest.id),
        eq(accountCategoryInferences.categoryId, categoryId), eq(accountCategoryInferences.ownerUserId, owner), eq(accountCategoryInferences.accountId, input.accountId), isNull(accountCategoryInferences.rejectedAt)));
    }
    const style = account.styleProfileJson ? JSON.parse(account.styleProfileJson) as Record<string, unknown> : {};
    if (!style.contentLocale && latest.resultJson) {
      const language = (JSON.parse(latest.resultJson) as InferenceResult).contentLanguage;
      if (language !== "unknown") style.contentLocale = language;
    }
    const selectedCategories = catalog.filter((item) => selected.includes(item.id));
    const selectedSlugs = selectedCategories.map((item) => item.slug);
    style.categories = Array.isArray(style.categories)
      ? [...new Set([...style.categories.map(String), ...selectedSlugs])].slice(0, 12)
      : selectedSlugs;
    if (!Array.isArray(style.preferredFormats)) {
      style.preferredFormats = [...new Set(selectedCategories.flatMap((item) => JSON.parse(item.defaultFormatsJson) as string[]))].slice(0, 4);
    }
    await tx.update(accounts).set({ styleProfileJson: JSON.stringify(style), updatedAt: input.now })
      .where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, owner)));
  });
  return getPostgresCategoryConfigs(owner, input.accountId);
}

const LANGUAGE_WORDS: Record<string, Set<string>> = {
  en: new Set(["the", "and", "for", "with", "from", "this", "that", "is", "are", "on", "of", "to", "in", "my", "your"]),
  tr: new Set(["ve", "ile", "için", "bu", "şu", "bir", "çok", "daha", "ama", "olarak", "göre", "mi", "mı", "de", "da"]),
  es: new Set(["el", "la", "los", "las", "y", "para", "con", "una", "un", "que", "por", "del", "en"]),
  fr: new Set(["le", "la", "les", "et", "pour", "avec", "une", "un", "des", "que", "dans", "sur"]),
};
const TOPIC_STOP_WORDS = new Set("the and for with from this that are was were have has had you your our their they them about into over after before when what where which while who how all not but can will just very more some also then than ve ile için bu şu bir çok daha ama olarak göre mi mı de da the a an is are to in on of my your el la los las y para con una un que por del en le les et pour avec des dans sur je tu il elle nous vous que qui quoi sur est sont les aux du de la y los las que para con una por del este esta este son sus como para más muy pero porque sobre entre hacia sin con una".split(/\s+/u));

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function terms(value: string): string[] {
  return [...new Set(normalize(value).split(/\s+/u).filter((word) => word.length > 2))];
}

function languageFor(text: string): string {
  const words = normalize(text).split(/\s+/u);
  const scores = Object.entries(LANGUAGE_WORDS).map(([language, vocabulary]) => ({ language, score: words.filter((word) => vocabulary.has(word)).length }))
    .sort((left, right) => right.score - left.score);
  return scores[0]?.score >= 2 && scores[0].score > (scores[1]?.score || 0) ? scores[0].language : "unknown";
}

export function inferAccountCategories(input: {
  handle: string; displayName: string; bio: string; posts: string[]; catalog: InferenceCategory[];
}): InferenceResult {
  const accountText = [input.displayName.slice(0, 200), input.handle.slice(0, 50), input.bio.slice(0, 2_000), ...input.posts.slice(0, 100).map((post) => post.slice(0, 4_000))].join(" ");
  const text = normalize(accountText);
  const contentLanguage = languageFor(accountText);
  const suggestions = input.catalog.flatMap((category) => {
    const vocabulary = [...new Set([...terms(category.slug), ...terms(category.name), ...category.keywords.flatMap(terms)])];
    const evidence = vocabulary.filter((term) => ` ${text} `.includes(` ${term} `)).slice(0, 10);
    if (evidence.length < 2) return [];
    return [{ categoryId: category.id, slug: category.slug, name: category.name, confidence: Math.min(0.95, Math.round((0.45 + evidence.length * 0.12) * 100) / 100), evidence }];
  }).sort((left, right) => right.confidence - left.confidence || left.slug.localeCompare(right.slug)).slice(0, 12);
  return { status: suggestions.length ? "ready" : "insufficient_evidence", contentLanguage, suggestions };
}

export function discoverAccountTopic(input: { bio: string; posts: string[] }): { name: string; slug: string; keywords: string[]; evidence: string[] } | null {
  const documents = [input.bio, ...input.posts.slice(0, 100)].map((value) => value.slice(0, 4_000)).filter(Boolean);
  const variants = new Map<string, string>();
  const termDocs = new Map<string, Set<number>>();
  const pairDocs = new Map<string, Set<number>>();
  const hashtagDocs = new Map<string, Set<number>>();
  for (const [index, document] of documents.entries()) {
    const hashes = [...document.matchAll(/#([\p{L}\p{N}_]{3,32})/gu)].map((match) => normalize(match[1] || "")).filter(Boolean);
    for (const tag of new Set(hashes)) hashtagDocs.set(tag, new Set([...(hashtagDocs.get(tag) || []), index]));
    const rawWords = document.normalize("NFKC").match(/[\p{L}\p{N}]{3,}/gu) || [];
    const words = rawWords.map((raw) => {
      const word = normalize(raw);
      if (!variants.has(word)) variants.set(word, raw.toLocaleLowerCase());
      return word;
    }).filter((word) => word && !TOPIC_STOP_WORDS.has(word) && !/^\d+$/u.test(word));
    for (const word of new Set(words)) termDocs.set(word, new Set([...(termDocs.get(word) || []), index]));
    for (let i = 0; i < words.length - 1; i++) {
      const left = words[i]!, right = words[i + 1]!;
      const pair = `${left} ${right}`;
      pairDocs.set(pair, new Set([...(pairDocs.get(pair) || []), index]));
    }
  }
  const candidates = [
    ...[...hashtagDocs].filter(([, docs]) => docs.size >= 2).map(([key, docs]) => ({ key, docs, score: 4 + docs.size, parts: [key] })),
    ...[...pairDocs].filter(([, docs]) => docs.size >= 2).map(([key, docs]) => ({ key, docs, score: 2 + docs.size, parts: key.split(" ") })),
    ...[...termDocs].filter(([, docs]) => docs.size >= 3).map(([key, docs]) => ({ key, docs, score: docs.size, parts: [key] })),
  ].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const chosen = candidates[0];
  if (!chosen) return null;
  const words = chosen.parts.map((word) => variants.get(word) || word);
  const name = words.map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(" ").slice(0, 60);
  const slug = chosen.key.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").replace(/ı/gu, "i").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 48);
  if (!name || !slug) return null;
  const evidence = documents.filter((document) => chosen.parts.every((part) => normalize(document).split(" ").includes(part))).slice(0, 5).map((document) => document.slice(0, 220));
  return { name, slug, keywords: words, evidence };
}

/** Runs one durable, owner/account-scoped inference job; completed retries return the same snapshot. */
export async function runAccountCategoryInference(input: { accountId: number; now?: number; regenerate?: boolean; client?: OfficialXClient }): Promise<InferenceResult> {
  const owner = inferenceOwner();
  const account = await getPostgresAccount(owner, input.accountId);
  if (!account?.ownerUserId || await isAuthenticatedUserDisabled(account.ownerUserId)) throw new Error("owned X account not found or owner disabled");
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const previous = await getOwnAccountInference(account.id);
  if (!input.regenerate && previous && ["ready", "insufficient_evidence"].includes(previous.status)) return previous.result;
  const job = await saveAccountInferenceJob({ accountId: account.id, status: "running", now, regenerate: input.regenerate === true });
  if (!job.claimed) {
    if (job.result) return job.result;
    throw new Error("account inference is already running");
  }
  try {
    const { profile, posts } = await withOfficialAccount(account, async (credential) => {
      if (!REQUIRED_INFERENCE_SCOPES.every((scope) => credential.scopes.includes(scope))) {
        throw new Error("X grant does not allow own profile and timeline reads");
      }
      const client = input.client || new OfficialXClient();
      const [profile, posts] = await Promise.all([client.getOwnProfile(credential), client.getOwnTimeline(credential, 100)]);
      return { profile, posts };
    });
    const styleProfile = account.styleProfile as Record<string, unknown>;
    const result = inferAccountCategories({
      handle: account.handle,
      displayName: account.displayName,
      bio: [profile.description, styleProfile.bio, styleProfile.niche].filter((value): value is string => typeof value === "string").join(" "),
      posts,
      catalog: (await getPostgresCategoriesForAccount(owner, account.id)).filter((category) => category.enabled).map((category) => ({ id: category.id, slug: category.slug, name: category.name, keywords: category.keywords, description: category.description })),
    });
    if (result.suggestions.length === 0) {
      const topic = discoverAccountTopic({ bio: [profile.description, styleProfile.bio, styleProfile.niche].filter((value): value is string => typeof value === "string").join(" "), posts });
      if (topic) {
        const category = await savePostgresAccountCategory(owner, account.id, {
          slug: topic.slug, name: topic.name, enabled: true, builtIn: false, baseStrategy: "generic", clusterStrategy: "topic",
          verificationMode: "moderate", description: `Hesap biyografisi ve gönderilerinde tekrar eden “${topic.name}” konusu.`,
          positiveExamples: topic.evidence, negativeExamples: [], keywords: topic.keywords, excludedKeywords: [], seedHandles: [],
          defaultFormats: ["post"], sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {},
          aiContext: "", now,
        });
        result.suggestions = [{ categoryId: category.id, slug: category.slug, name: category.name, confidence: 0.68, evidence: topic.evidence.map((item) => item.slice(0, 80)) }];
        result.status = "ready";
      }
    }
    await saveAccountInferenceSuggestions({ accountId: account.id, jobId: job.id, result, now });
    return result;
  } catch (error) {
    await saveAccountInferenceJob({ accountId: account.id, status: "failed", now, jobId: job.id });
    throw error;
  }
}

/** Process a small batch of pending account inferences from the shared worker. */
export async function runPendingAccountCategoryInferences(input: {
  now?: number; limit?: number; client?: OfficialXClient;
} = {}): Promise<AccountInferenceSweepResult> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const limit = Math.max(1, Math.min(20, Math.floor(input.limit ?? 5)));
  const result: AccountInferenceSweepResult = { attempted: 0, completed: 0, skipped: 0, failed: 0 };
  const ownedRows = await getPostgresDb().select().from(accounts);
  const enabledOwners = new Set<string>();
  for (const account of ownedRows) if (!await isAuthenticatedUserDisabled(account.ownerUserId)) enabledOwners.add(account.ownerUserId);
  result.skipped += ownedRows.filter((account) => !enabledOwners.has(account.ownerUserId)).length;
  const eligibleAccounts = ownedRows.filter((account) => enabledOwners.has(account.ownerUserId));

  for (const row of eligibleAccounts) {
    if (result.attempted >= limit) break;
    const account = await getPostgresAccount(row.ownerUserId, row.id);
    if (!account) continue;
    try {
      const outcome = await runAsOwner(account.ownerUserId, async () => {
        const grant = await getPostgresXAccountAuthState(account.id, account.ownerUserId);
        if (!grant?.connected || !REQUIRED_INFERENCE_SCOPES.every((scope) => grant.scopes.includes(scope))) return "skipped" as const;
        const previous = await getOwnAccountInference(account.id);
        if (previous && ["ready", "insufficient_evidence"].includes(previous.status)) return "skipped" as const;
        result.attempted += 1;
        try {
          await runAccountCategoryInference({ accountId: account.id, now, client: input.client });
          return "completed" as const;
        } catch (error) {
          if (error instanceof Error && error.message === "account inference is already running") return "skipped" as const;
          return "failed" as const;
        }
      });
      result[outcome] += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
