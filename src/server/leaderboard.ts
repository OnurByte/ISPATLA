import { listQualifiedLeaderboardEvidence, type LeaderboardEvidence } from "@/server/db";
import { ensureEvaluationStore } from "@/server/evaluation-store";

export const LEADERBOARD_MIN_BASELINE = 5;
export const LEADERBOARD_TABS = ["week", "month", "accounts", "improvement"] as const;
export type LeaderboardTab = typeof LEADERBOARD_TABS[number];
export type RankedHit = {
  publicId: string; accountHandle: string; text: string; postUrl: string;
  publishedAt: number; observedAt: number; relativePerformance: number;
  engagementRate: number; baselineSamples: number;
};
export type RankedAccount = { accountHandle: string; publicId: string; score: number; samples: number };
export type Leaderboard = { week: RankedHit[]; month: RankedHit[]; accounts: RankedAccount[]; improvement: RankedAccount[] };

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function interactions(post: LeaderboardEvidence): number {
  return post.metrics.likes! + post.metrics.replies! + post.metrics.reposts! + post.metrics.quotes!;
}
function rate(post: LeaderboardEvidence): number { return interactions(post) / post.followers; }

/** Relative to the account's earlier official observations, never another owner's history. */
export function rankLeaderboardEvidence(evidence: LeaderboardEvidence[], now: number): Leaderboard {
  const day = 86400;
  const valid = evidence.filter((post) => {
    const age = post.observedAt - post.publishedAt;
    return age >= day && age <= 30 * 3600 && post.observedAt <= now && post.followers > 0
      && Number.isSafeInteger(post.followers)
      && [post.metrics.likes,post.metrics.replies,post.metrics.reposts,post.metrics.quotes].every((value) => value !== null && Number.isSafeInteger(value) && value >= 0);
  });
  type Classified = Omit<RankedHit, "publicId"> & { publicId: string | null; ownerUserId: string; accountId: number; hit: boolean };
  const groups = new Map<string, LeaderboardEvidence[]>();
  for (const post of valid) {
    const key = JSON.stringify([post.ownerUserId,post.accountId]);
    const group = groups.get(key);
    if (group) group.push(post); else groups.set(key, [post]);
  }
  const publicHits: RankedHit[] = [];
  const accounts: RankedAccount[] = [], improvements: (RankedAccount & { owner: string })[] = [];
  for (const evidenceGroup of groups.values()) {
    const ordered = evidenceGroup.toSorted((a, b) => b.publishedAt - a.publishedAt);
    const classified: Classified[] = [];
    for (const post of ordered) {
      const age = post.observedAt - post.publishedAt;
      const previous = ordered.filter((item) => item.remotePostId !== post.remotePostId && item.publishedAt < post.publishedAt
        && item.publishedAt >= post.publishedAt - 90 * day
        && Math.abs((item.observedAt - item.publishedAt) / age - 1) <= 0.1).slice(0, 20);
      if (previous.length < LEADERBOARD_MIN_BASELINE) continue;
      const baseline = median(previous.map(rate));
      if (baseline <= 0) continue;
      const relativePerformance = rate(post) / baseline;
      classified.push({ publicId: post.publicId, accountHandle: post.accountHandle, text: post.text, postUrl: post.postUrl,
        publishedAt: post.publishedAt, observedAt: post.observedAt, relativePerformance, engagementRate: rate(post) * 100,
        baselineSamples: previous.length, ownerUserId: post.ownerUserId, accountId: post.accountId,
        hit: relativePerformance >= 2 && interactions(post) >= 10 });
    }
    for (const item of classified) {
      if (!item.publicId || !item.hit) continue;
      publicHits.push({ publicId: item.publicId, accountHandle: item.accountHandle, text: item.text, postUrl: item.postUrl,
        publishedAt: item.publishedAt, observedAt: item.observedAt, relativePerformance: item.relativePerformance,
        engagementRate: item.engagementRate, baselineSamples: item.baselineSamples });
    }
    // All qualified outcomes count, including unshared poor results, once a representative card opts in.
    const current = classified.filter((item) => item.publishedAt >= now - 30 * day);
    const representative = current.find((item) => item.publicId);
    if (current.length < 5 || !representative?.publicId) continue;
    accounts.push({ accountHandle: representative.accountHandle, publicId: representative.publicId,
      score: median(current.map((item) => item.relativePerformance)), samples: current.length });
    const previous = classified.filter((item) => item.publishedAt < now - 30 * day && item.publishedAt >= now - 60 * day);
    if (previous.length < 5) continue;
    const baseline = median(previous.map((item) => item.engagementRate));
    if (baseline <= 0) continue;
    improvements.push({ owner: representative.ownerUserId, accountHandle: representative.accountHandle, publicId: representative.publicId,
      score: median(current.map((item) => item.engagementRate)) / baseline, samples: current.length });
  }
  const hits = (days: number) => publicHits.filter((item) => item.publishedAt >= now - days * day)
    .toSorted((a, b) => b.relativePerformance - a.relativePerformance || b.publishedAt - a.publishedAt || a.publicId.localeCompare(b.publicId))
    .slice(0, 100);
  const sorted = (items: RankedAccount[]) => items.toSorted((a, b) => b.score - a.score || a.publicId.localeCompare(b.publicId)).slice(0, 100);
  // One result per opted-in user; additional accounts cannot occupy the whole board.
  const seenOwners = new Set<string>();
  const improvement = improvements.toSorted((a, b) => b.score - a.score || a.publicId.localeCompare(b.publicId))
    .filter((item) => !seenOwners.has(item.owner) && !!seenOwners.add(item.owner))
    .slice(0, 100).map(({ accountHandle, publicId, score, samples }) => ({ accountHandle, publicId, score, samples }));
  return { week: hits(7), month: hits(30), accounts: sorted(accounts), improvement };
}

export function getLeaderboard(now = Math.floor(Date.now() / 1000)): Leaderboard {
  ensureEvaluationStore();
  return rankLeaderboardEvidence(listQualifiedLeaderboardEvidence(), now);
}
