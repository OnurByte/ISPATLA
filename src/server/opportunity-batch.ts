/**
 * Opportunity batch ranking (Faz B3).
 *
 * The decision unit is the candidate pool x the publishing accounts: one Jev call
 * per <=3 accounts covers the whole scan, instead of one call per post. This is the
 * ONLY Jev call site on the post path; monitoring and per-post scoring stay
 * deterministic.
 *
 *   candidates(32) -> <=32 JevCandidates (title = first line, statement = truncated
 *   text, scope = sourceHandle, domains = the source's category slugs)
 *   enabled accounts -> one facet each (category definitions + style niche),
 *   chunked into groups of <=3 because Jev accepts at most 3 facets per call.
 *
 * Results are persisted on the post (relevance_score / relevance_json) and in the
 * jev_scores ledger. Whether the persisted relevance changes a decision is decided
 * elsewhere: opportunityScoreForPost() reads it only in jev_mode "on".
 *
 * Cadence guard: a day-keyed counter in app_settings (`jev_batch:YYYY-MM-DD`) is
 * compared against `jev_daily_batch_cap` (default 300) before every call. Beyond the
 * cap nothing touches the network and the decision row carries `budget_exceeded`.
 */

import {
  getSetting,
  postAccountRelevance,
  recordDecision,
  setSetting,
  updatePostRelevance,
  type Account,
  type AccountCategoryConfig,
  type CategoryDefinition,
  type ObservedPost,
  type RecentPost,
} from "./db";
import { jevMode, jevScore, jevToPercent, recordJevScores, JEV_MAX_CANDIDATES, JEV_MAX_FACETS, type JevCandidate } from "./jev";

export const JEV_DAILY_BATCH_CAP_SETTING = "jev_daily_batch_cap";
export const JEV_DEFAULT_DAILY_BATCH_CAP = 300;
export const JEV_BATCH_DAY_PREFIX = "jev_batch:";
export const JEV_BATCH_SCOPE = "opportunity_batch";
export const JEV_BATCH_QUERY = "Bu aday hesabın yayın alanına ne kadar doğrudan giriyor?";
/** Keeps 32 candidates x 3 facets well inside the 24000 char request budget. */
const STATEMENT_CHARS = 400;
const FACET_CHARS = 600;

export type OpportunityBatchResult = {
  mode: string;
  calls: number;
  degraded: boolean;
  diagnostics: string[];
  /** externalId -> 0-100 relevance (max over accounts). */
  relevance: Record<string, number>;
  /** externalId -> { accountId: 0-100 }. */
  perAccount: Record<string, Record<number, number>>;
  accountIds: number[];
  postIds: string[];
  localOrder: string[];
  jevOrder: string[];
  capped: boolean;
};

function empty(mode: string, diagnostics: string[], capped = false): OpportunityBatchResult {
  return {
    mode,
    calls: 0,
    degraded: diagnostics.length > 0,
    diagnostics,
    relevance: {},
    perAccount: {},
    accountIds: [],
    postIds: [],
    localOrder: [],
    jevOrder: [],
    capped,
  };
}

export function dayKey(now: number): string {
  return `${JEV_BATCH_DAY_PREFIX}${new Date(now * 1000).toISOString().slice(0, 10)}`;
}

export function dailyBatchCap(): number {
  const raw = Number(getSetting(JEV_DAILY_BATCH_CAP_SETTING, String(JEV_DEFAULT_DAILY_BATCH_CAP)));
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : JEV_DEFAULT_DAILY_BATCH_CAP;
}

export function batchCallsToday(now: number): number {
  const raw = Number(getSetting(dayKey(now), "0"));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function countBatchCall(now: number): void {
  setSetting(dayKey(now), String(batchCallsToday(now) + 1), now);
}

function firstLine(text: string): string {
  return (text.split("\n").find((line) => line.trim().length > 0) || text).trim().slice(0, 180);
}

export function toJevCandidate(post: Pick<ObservedPost, "externalId" | "sourceHandle" | "text">, domains: string[]): JevCandidate {
  return {
    id: post.externalId,
    title: firstLine(post.text) || post.externalId,
    statement: post.text.trim().slice(0, STATEMENT_CHARS),
    scope: post.sourceHandle,
    domains: domains.slice(0, 6),
  };
}

/** One facet per account: its enabled category definitions plus the style niche. */
export function accountFacet(
  account: Account,
  categories: CategoryDefinition[],
  configurations: AccountCategoryConfig[],
): string {
  const slugs = new Set(configurations.filter((item) => item.accountId === account.id && item.enabled).map((item) => item.categorySlug));
  const definitions = categories.filter((category) => category.enabled && slugs.has(category.slug));
  const niche = typeof account.styleProfile.niche === "string" ? account.styleProfile.niche.trim() : "";
  const described = definitions
    .map((category) => [category.name, category.description, category.keywords.slice(0, 8).join(", ")].map((part) => String(part || "").trim()).filter(Boolean).join(" — "))
    .filter(Boolean)
    .join(" | ");
  return [`@${account.handle} yayın alanı`, described, niche]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(". ")
    .slice(0, FACET_CHARS);
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

function orderOf(posts: RecentPost[], score: (post: RecentPost) => number): string[] {
  return [...posts]
    .sort((left, right) => score(right) - score(left) || right.createdTimestamp - left.createdTimestamp)
    .map((post) => post.externalId);
}

/**
 * Scores the candidate pool against every enabled account in as few Jev calls as
 * possible, persists the result and records one `jev_rank` decision row. Never
 * throws: every failure resolves to a degraded result and leaves the local path
 * untouched.
 */
export async function rankOpportunityBatch(input: {
  posts: RecentPost[];
  accounts: Account[];
  categories: CategoryDefinition[];
  accountConfigurations?: AccountCategoryConfig[];
  sourceDomains?: (post: RecentPost) => string[];
  localScore?: (post: RecentPost) => number;
  now: number;
}): Promise<OpportunityBatchResult> {
  const mode = jevMode();
  if (mode === "off") return empty("off", ["disabled"]);

  const posts = input.posts.slice(0, JEV_MAX_CANDIDATES);
  const accounts = input.accounts.filter((account) => account.enabled);
  if (!posts.length || !accounts.length) return empty(mode, []);

  const configurations = input.accountConfigurations || [];
  const domainsFor = input.sourceDomains || (() => []);
  const candidates = posts.map((post) => toJevCandidate(post, domainsFor(post)));
  const facetByAccount = new Map(accounts.map((account) => [account.id, accountFacet(account, input.categories, configurations)] as const));

  const relevance: Record<string, number> = {};
  const perAccount: Record<string, Record<number, number>> = {};
  const diagnostics = new Set<string>();
  let calls = 0;
  let degraded = false;
  let capped = false;

  for (const group of chunk(accounts, JEV_MAX_FACETS)) {
    if (batchCallsToday(input.now) >= dailyBatchCap()) {
      capped = true;
      diagnostics.add("budget_exceeded");
      break;
    }
    countBatchCall(input.now);
    calls += 1;
    const result = await jevScore({
      query: JEV_BATCH_QUERY,
      facets: group.map((account) => facetByAccount.get(account.id) || `@${account.handle}`),
      candidates,
      scope: JEV_BATCH_SCOPE,
    });
    for (const diagnostic of result.diagnostics) diagnostics.add(diagnostic);
    if (result.degraded) {
      degraded = true;
      continue;
    }
    const entries: Array<{ subjectId: string; questionKey: string; score: number }> = [];
    group.forEach((account, facetIndex) => {
      const facetScores = result.facetScores[String(facetIndex)] || {};
      for (const candidate of candidates) {
        const raw = facetScores[candidate.id];
        if (raw === undefined) continue;
        const percent = jevToPercent(raw);
        perAccount[candidate.id] = { ...(perAccount[candidate.id] || {}), [account.id]: percent };
        relevance[candidate.id] = Math.max(relevance[candidate.id] ?? 0, percent);
        entries.push({ subjectId: candidate.id, questionKey: String(account.id), score: raw });
      }
    });
    if (entries.length) recordJevScores({ subjectKind: "post", entries, result, now: input.now });
  }

  for (const post of posts) {
    const value = relevance[post.externalId];
    if (value === undefined) continue;
    updatePostRelevance({
      externalId: post.externalId,
      relevance: value,
      source: "jev",
      details: { perAccount: perAccount[post.externalId] || {}, mode, scope: JEV_BATCH_SCOPE },
      now: input.now,
    });
  }

  const localScore = input.localScore || ((post: RecentPost) => post.score);
  const localOrder = orderOf(posts, localScore);
  const jevOrder = orderOf(posts, (post) => relevance[post.externalId] ?? -1);
  const top = posts.find((post) => post.externalId === localOrder[0]) || posts[0];
  try {
    recordDecision({
      externalId: top.externalId,
      clusterKey: top.clusterKey,
      accountIds: accounts.map((account) => account.id),
      categories: [...new Set(posts.flatMap((post) => domainsFor(post)))].slice(0, 12),
      score: relevance[top.externalId] ?? 0,
      selected: false,
      reasonCode: "jev_rank",
      details: {
        mode,
        calls,
        degraded,
        capped,
        diagnostics: [...diagnostics],
        localOrder,
        jevOrder,
        perAccount,
      },
      now: input.now,
    });
  } catch {
    // The decision row is observational; a ledger failure must not fail the scan.
  }

  return {
    mode,
    calls,
    degraded,
    diagnostics: [...diagnostics],
    relevance,
    perAccount,
    accountIds: accounts.map((account) => account.id),
    postIds: posts.map((post) => post.externalId),
    localOrder,
    jevOrder,
    capped,
  };
}

/**
 * The eligible account with the strictly highest per-account relevance, or undefined
 * when there is no relevance evidence or the best value is tied. Ties and absences
 * fall back to the legacy selector, so relevance only ever reorders accounts the
 * existing gates already accepted.
 */
export function preferredRelevanceAccount(
  eligible: Account[],
  post: Pick<ObservedPost, "relevanceJson">,
): Account | undefined {
  const map = postAccountRelevance(post);
  const scored = eligible.map((account) => ({ account, score: map[account.id] ?? -1 })).filter((item) => item.score >= 0);
  if (!scored.length) return undefined;
  const best = Math.max(...scored.map((item) => item.score));
  const top = scored.filter((item) => item.score === best);
  return top.length === 1 ? top[0].account : undefined;
}
