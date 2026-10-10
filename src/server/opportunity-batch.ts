/** Pure serializers and selectors for candidate relevance evidence. */

import type { Account, AccountCategoryConfig, CategoryDefinition, ObservedPost, RecentPost } from "./db-types";

import type { JevCandidate } from "./jev";

export const JEV_BATCH_DAY_PREFIX = "jev_batch:";
export const JEV_BATCH_QUERY = "Bu aday hesabın yayın alanına ne kadar doğrudan giriyor?";
const STATEMENT_CHARS = 400;
const FACET_CHARS = 600;

export function dayKey(now: number): string {
  return `${JEV_BATCH_DAY_PREFIX}${new Date(now * 1000).toISOString().slice(0, 10)}`;
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
  let map: Record<number, number> = {};
  try {
    const relevance = JSON.parse(post.relevanceJson || "{}") as { perAccount?: Record<string, number> };
    map = Object.fromEntries(Object.entries(relevance.perAccount || {}).flatMap(([id, score]) => {
      const accountId = Number(id);
      return Number.isSafeInteger(accountId) && Number.isFinite(score) ? [[accountId, score]] : [];
    }));
  } catch { /* malformed optional relevance is ignored */ }
  const scored = eligible.map((account) => ({ account, score: map[account.id] ?? -1 })).filter((item) => item.score >= 0);
  if (!scored.length) return undefined;
  const best = Math.max(...scored.map((item) => item.score));
  const top = scored.filter((item) => item.score === best);
  return top.length === 1 ? top[0].account : undefined;
}
