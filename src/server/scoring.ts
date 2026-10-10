import type { ObservedPost, PublicMetrics } from "./db-types";

export const OPPORTUNITY_MAX_AGE_SECONDS = 24 * 60 * 60;

type MetricInput = Partial<PublicMetrics> & { poll_votes?: unknown };

export function metricBreakdown(input: MetricInput) {
  const metrics: PublicMetrics = {
    likes: Math.max(0, Number(input.likes) || 0),
    replies: Math.max(0, Number(input.replies) || 0),
    reposts: Math.max(0, Number(input.reposts) || 0),
    quotes: Math.max(0, Number(input.quotes) || 0),
    views: Math.max(0, Number(input.views) || 0),
    pollVotes: Math.max(0, Number(input.pollVotes ?? input.poll_votes) || 0),
  };
  const engagements = metrics.likes + metrics.replies + metrics.reposts + metrics.quotes;
  const denominator = metrics.views > 0 ? metrics.views : 0;
  return {
    ...metrics,
    engagements,
    engagementRate: denominator ? engagements / denominator : 0,
    replyRate: denominator ? metrics.replies / denominator : 0,
    repostRate: denominator ? metrics.reposts / denominator : 0,
    quoteRate: denominator ? metrics.quotes / denominator : 0,
  };
}

function nonNegative(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function observedEngagement(input: Pick<ObservedPost, "likes" | "replies" | "reposts" | "quotes" | "createdTimestamp"> & { followers?: number; now?: number }): {
  engagements: number;
  velocity: number;
  rate: number;
} {
  const engagements = nonNegative(input.likes) + nonNegative(input.replies) + nonNegative(input.reposts) + nonNegative(input.quotes);
  const ageHours = Math.max(0.25, ((input.now || Math.floor(Date.now() / 1000)) - nonNegative(input.createdTimestamp)) / 3600);
  return { engagements, velocity: engagements / ageHours, rate: nonNegative(input.followers) > 0 ? engagements / nonNegative(input.followers) : 0 };
}

export type MetricSnapshot = { likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; views: number | null; capturedAt: number; quality: "ok" | "partial" | "stale" | "unknown" };

export function snapshotEngagement(snapshot: MetricSnapshot): number | null {
  const values = [snapshot.likes, snapshot.replies, snapshot.reposts, snapshot.quotes];
  return values.every((value) => value !== null) ? values.reduce((total, value) => total + value!, 0) : null;
}

export function snapshotAcceleration(previous: MetricSnapshot, current: MetricSnapshot): number | null {
  const before = snapshotEngagement(previous);
  const after = snapshotEngagement(current);
  const seconds = current.capturedAt - previous.capturedAt;
  if (before === null || after === null || seconds <= 0 || previous.quality !== "ok" || current.quality !== "ok") return null;
  return (after - before) / seconds;
}

export function overperformance(actual: number | null, baseline: number | null): number | null {
  if (actual === null || baseline === null || baseline <= 0) return null;
  return actual / baseline;
}

export function ageNormalizedOverperformance(current: MetricSnapshot, baseline: { engagement: number | null; views: number | null } | null): number | null {
  if (current.quality !== "ok" || !baseline) return null;
  return overperformance(snapshotEngagement(current), baseline.engagement);
}

export function isNumericalHit(momentum: number, createdTimestamp: number, risk = 0, now = Math.floor(Date.now() / 1000)): boolean {
  return momentum >= 90 && risk < 35 && createdTimestamp > 0 && now - createdTimestamp <= 2 * 60 * 60;
}

export function clusterKey(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 8)
    .join("-");
}

export function scorePost(input: Pick<ObservedPost, "likes" | "replies" | "reposts" | "quotes" | "views" | "createdTimestamp" | "mediaCount" | "sensitive"> & { followers?: number; now?: number }): {
  score: number;
  reason: string;
} {
  const views = nonNegative(input.views);
  const mediaCount = nonNegative(input.mediaCount);
  const followers = nonNegative(input.followers);
  const engagement = observedEngagement(input);
  const velocity = engagement.velocity;
  const engagementRate = engagement.rate;
  const score = Math.min(
    100,
    Math.max(
      0,
      Math.log1p(velocity) * 8 +
        Math.min(18, Math.log1p(views) * 1.4) +
        Math.min(18, Math.log1p(engagementRate * 1_000) * 5) +
        (mediaCount > 0 ? 5 : 0) -
        (input.sensitive ? 100 : 0),
    ),
  );

  const rounded = Math.round(score);
  return {
    score: rounded,
    reason: `deterministic:${JSON.stringify({
      momentum: rounded,
      risk: input.sensitive ? 100 : rounded < 70 ? 45 : 15,
      reason: `velocity=${Math.round(velocity)};views=${Math.round(views)};followers=${Math.round(followers)};engagementRate=${engagementRate.toFixed(4)};media=${mediaCount};sensitive=${input.sensitive}`,
    })}`,
  };
}

export function historicalPerformanceScore(samples: Array<{ likes: number; replies: number; reposts: number; quotes: number; views: number }>): number | null {
  if (!samples.length) return null;
  const average = samples.reduce((total, sample) => {
    const views = Math.max(1, nonNegative(sample.views));
    const actions = nonNegative(sample.likes) + nonNegative(sample.replies) + nonNegative(sample.reposts) + nonNegative(sample.quotes);
    return total + Math.min(100, Math.log1p(actions) * 10 + Math.min(50, (actions / views) * 10_000));
  }, 0) / samples.length;
  return Math.round(average);
}

export function isCurrentOpportunity(createdTimestamp: number, now = Math.floor(Date.now() / 1000)): boolean {
  return createdTimestamp > 0 && createdTimestamp <= now + 300 && now - createdTimestamp <= OPPORTUNITY_MAX_AGE_SECONDS;
}

export function opportunityFreshness(createdTimestamp: number, now = Math.floor(Date.now() / 1000)): number {
  if (!isCurrentOpportunity(createdTimestamp, now)) return 0;
  return Math.max(0, Math.round(100 - Math.max(0, (now - createdTimestamp) / 3600) * 4));
}

export function opportunityScore(momentum: number, createdTimestamp: number, risk = 0, now = Math.floor(Date.now() / 1000)): number {
  if (risk >= 70) return 0;
  return Math.round(Math.max(0, momentum) * opportunityFreshness(createdTimestamp, now) / 100);
}

export function selectDiverseCandidates<T extends { sourceHandle: string; clusterKey: string }>(posts: T[], limit: number): T[] {
  const selected: T[] = [];
  const sources = new Set<string>();
  const clusters = new Set<string>();
  for (const post of posts) {
    if (selected.length >= limit) break;
    if (sources.has(post.sourceHandle) || (post.clusterKey && clusters.has(post.clusterKey))) continue;
    selected.push(post);
    sources.add(post.sourceHandle);
    if (post.clusterKey) clusters.add(post.clusterKey);
  }
  return selected;
}

/**
 * Layered relevance (Faz B3). `relevance` is a 0-100 Jev relevance percentage or
 * null when no relevance evidence exists. null keeps the legacy behaviour exactly
 * (factor 1.0); otherwise the factor is 0.5 + relevance/100 clamped to [0.5, 1.5],
 * so relevance can halve or (at most) 1.5x a deterministic opportunity score but
 * never replaces it.
 */
export function relevanceFactor(relevance: number | null): number {
  if (relevance === null || relevance === undefined || !Number.isFinite(relevance)) return 1;
  return Math.min(1.5, Math.max(0.5, 0.5 + relevance / 100));
}

/**
 * opportunityScore scaled by relevanceFactor and clamped back to 0-100.
 *
 * Faz B3 shape, kept for the version-2 fixture snapshot and its tests. The live
 * path uses opportunityScoreRelevanceAware(), which additionally scales the
 * freshness decay rate.
 */
export function opportunityScoreWithRelevance(
  momentum: number,
  createdTimestamp: number,
  risk = 0,
  relevance: number | null = null,
  now = Math.floor(Date.now() / 1000),
): number {
  const base = opportunityScore(momentum, createdTimestamp, risk, now);
  return Math.min(100, Math.max(0, Math.round(base * relevanceFactor(relevance))));
}

/**
 * Relevance-aware freshness (Faz B4).
 *
 * Legacy freshness burns a flat 4 points per hour, so a 19h old post keeps 24% of
 * its momentum no matter how well it fits the account. The decay rate now scales
 * with the same 0-100 relevance the opportunity batch persists: highly relevant
 * posts age slowly, irrelevant ones age fast.
 *
 *   relevance >= 80        -> 2 points/hour
 *   relevance <= 20        -> 6 points/hour
 *   20 < relevance < 80    -> linear between 6 and 2
 *   relevance === null     -> 4 points/hour (legacy, byte-identical)
 */
export const LEGACY_FRESHNESS_DECAY_PER_HOUR = 4;
export const MIN_FRESHNESS_DECAY_PER_HOUR = 2;
export const MAX_FRESHNESS_DECAY_PER_HOUR = 6;
export const FRESHNESS_DECAY_HIGH_RELEVANCE = 80;
export const FRESHNESS_DECAY_LOW_RELEVANCE = 20;

export function freshnessDecayPerHour(relevance: number | null): number {
  if (relevance === null || relevance === undefined || !Number.isFinite(relevance)) return LEGACY_FRESHNESS_DECAY_PER_HOUR;
  const value = Math.min(100, Math.max(0, relevance));
  if (value >= FRESHNESS_DECAY_HIGH_RELEVANCE) return MIN_FRESHNESS_DECAY_PER_HOUR;
  if (value <= FRESHNESS_DECAY_LOW_RELEVANCE) return MAX_FRESHNESS_DECAY_PER_HOUR;
  const span = FRESHNESS_DECAY_HIGH_RELEVANCE - FRESHNESS_DECAY_LOW_RELEVANCE;
  const drop = MAX_FRESHNESS_DECAY_PER_HOUR - MIN_FRESHNESS_DECAY_PER_HOUR;
  return MAX_FRESHNESS_DECAY_PER_HOUR - ((value - FRESHNESS_DECAY_LOW_RELEVANCE) * drop) / span;
}

/**
 * opportunityFreshness with a relevance-scaled decay rate. The 24h opportunity
 * window (isCurrentOpportunity) is unchanged: relevance slows the decay inside the
 * window, it never extends it. `relevance === null` returns opportunityFreshness().
 */
export function opportunityFreshnessForRelevance(
  createdTimestamp: number,
  relevance: number | null,
  now = Math.floor(Date.now() / 1000),
): number {
  if (!isCurrentOpportunity(createdTimestamp, now)) return 0;
  const ageHours = Math.max(0, (now - createdTimestamp) / 3600);
  return Math.max(0, Math.round(100 - ageHours * freshnessDecayPerHour(relevance)));
}

/**
 * The live opportunity score (jev_mode "on"): relevance both slows the freshness
 * decay and scales the result through relevanceFactor. `relevance === null` falls
 * back to opportunityScore() exactly, so mode "off" stays byte-identical.
 */
export function opportunityScoreRelevanceAware(
  momentum: number,
  createdTimestamp: number,
  risk = 0,
  relevance: number | null = null,
  now = Math.floor(Date.now() / 1000),
): number {
  if (risk >= 70) return 0;
  if (relevance === null || relevance === undefined || !Number.isFinite(relevance)) {
    return opportunityScore(momentum, createdTimestamp, risk, now);
  }
  const freshness = opportunityFreshnessForRelevance(createdTimestamp, relevance, now);
  const raw = (Math.max(0, momentum) * freshness * relevanceFactor(relevance)) / 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}
