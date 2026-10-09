import { getAccounts, getCategoriesForAccount, getOwnAccountInference, isOwnerEnabled, saveAccountInferenceJob, saveAccountInferenceSuggestions, saveGeneratedAccountCategory, type Account } from "./db";
import { withOfficialAccount } from "./publisher";
import { OfficialXClient } from "./official-x";
import { runAsOwner } from "./owner-context";
import { getXAccountAuthState } from "./x-oauth-store";

export type InferenceCategory = { id: number; slug: string; name: string; keywords: string[]; description: string };
export type InferenceResult = {
  status: "ready" | "insufficient_evidence";
  contentLanguage: string;
  suggestions: Array<{ categoryId: number; slug: string; name: string; confidence: number; evidence: string[] }>;
};
export type AccountInferenceSweepResult = { attempted: number; completed: number; skipped: number; failed: number };

const REQUIRED_INFERENCE_SCOPES = ["tweet.read", "users.read"] as const;

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
  const account = getAccounts().find((item) => item.id === input.accountId);
  if (!account?.ownerUserId || !isOwnerEnabled(account.ownerUserId)) throw new Error("owned X account not found or owner disabled");
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const previous = getOwnAccountInference(account.id);
  if (!input.regenerate && previous && ["ready", "insufficient_evidence"].includes(previous.status)) return previous.result;
  const job = saveAccountInferenceJob({ accountId: account.id, status: "running", now, regenerate: input.regenerate === true });
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
    const result = inferAccountCategories({
      handle: account.handle,
      displayName: account.displayName,
      bio: [profile.description, account.styleProfile.bio, account.styleProfile.niche].filter((value): value is string => typeof value === "string").join(" "),
      posts,
      catalog: getCategoriesForAccount(account.id).filter((category) => category.enabled).map((category) => ({ id: category.id, slug: category.slug, name: category.name, keywords: category.keywords, description: category.description })),
    });
    if (result.suggestions.length === 0) {
      const topic = discoverAccountTopic({ bio: [profile.description, account.styleProfile.bio, account.styleProfile.niche].filter((value): value is string => typeof value === "string").join(" "), posts });
      if (topic) {
        const category = saveGeneratedAccountCategory({
          accountId: account.id, name: topic.name, slug: topic.slug,
          description: `Hesap biyografisi ve gönderilerinde tekrar eden “${topic.name}” konusu.`,
          keywords: topic.keywords, examples: topic.evidence, now,
        });
        result.suggestions = [{ categoryId: category.id, slug: category.slug, name: category.name, confidence: 0.68, evidence: topic.evidence.map((item) => item.slice(0, 80)) }];
        result.status = "ready";
      }
    }
    saveAccountInferenceSuggestions({ accountId: account.id, jobId: job.id, result, now });
    return result;
  } catch (error) {
    saveAccountInferenceJob({ accountId: account.id, status: "failed", now, jobId: job.id });
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
  const ownedAccounts = getAccounts().filter((account): account is Account & { ownerUserId: string } => Boolean(account.ownerUserId));
  result.skipped += ownedAccounts.filter((account) => !isOwnerEnabled(account.ownerUserId)).length;
  const accounts = ownedAccounts.filter((account) => isOwnerEnabled(account.ownerUserId));

  for (const account of accounts) {
    if (result.attempted >= limit) break;
    try {
      const outcome = await runAsOwner(account.ownerUserId, async () => {
        const grant = getXAccountAuthState(account.id, account.ownerUserId);
        if (!grant?.connected || !REQUIRED_INFERENCE_SCOPES.every((scope) => grant.scopes.includes(scope))) return "skipped" as const;
        const previous = getOwnAccountInference(account.id);
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
