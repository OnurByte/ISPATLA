// Deterministic snapshot of the PURE opportunity-scoring behaviour.
//
// Touches no database, no network and no wall clock: it runs scorePost,
// opportunityFreshness, opportunityScore, isNumericalHit and selectDiverseCandidates
// from src/server/scoring.ts over tests/fixtures/opportunity-fixture.ts at the frozen
// FIXTURE_NOW and prints stable JSON on stdout.
//
//   bun scripts/fixture-snapshot.ts > ../jev-context/olcum/oncesi-fixture.json
//
// Rerun it unchanged after the Jev integration: any diff is a behaviour change.

import { freshnessDecayPerHour, isNumericalHit, opportunityFreshness, opportunityFreshnessForRelevance, opportunityScore, opportunityScoreRelevanceAware, opportunityScoreWithRelevance, relevanceFactor, scorePost, selectDiverseCandidates } from "../src/server/scoring";
import { FIXTURE_NOW, FIXTURE_RELEVANCE, OPPORTUNITY_FIXTURE } from "../tests/fixtures/opportunity-fixture";

const NOW = FIXTURE_NOW;

/** Mirrors scoreEvidenceFor() for the `deterministic:` reasons scorePost emits. */
function evidenceOf(reason: string, score: number): { momentum: number; risk: number } {
  const separator = reason.indexOf(":");
  const kind = separator >= 0 ? reason.slice(0, separator) : reason;
  const json = separator >= 0 ? reason.slice(separator + 1) : "";
  if (kind === "deterministic" && json) {
    try {
      const parsed = JSON.parse(json) as { momentum?: number; risk?: number };
      return { momentum: Number(parsed.momentum || 0), risk: Number(parsed.risk || 0) };
    } catch {
      // fall through to the score-derived default
    }
  }
  return { momentum: Math.round(score), risk: 0 };
}

const scored = OPPORTUNITY_FIXTURE.map((post) => {
  const { score, reason } = scorePost({ ...post, now: NOW });
  const { momentum, risk: reasonRisk } = evidenceOf(reason, score);
  // Sensitive posts always receive risk 100.
  const risk = post.sensitive ? 100 : reasonRisk;
  const freshness = opportunityFreshness(post.createdTimestamp, NOW);
  return {
    externalId: post.externalId,
    sourceHandle: post.sourceHandle,
    clusterKey: post.clusterKey,
    ageSeconds: NOW - post.createdTimestamp,
    score,
    momentum,
    risk,
    freshness,
    opportunityScore: opportunityScore(score, post.createdTimestamp, risk, NOW),
    hit: isNumericalHit(momentum, post.createdTimestamp, risk, NOW),
    // version 2, appended so every version-1 field keeps its value and its position.
    relevance: FIXTURE_RELEVANCE[post.externalId] ?? null,
    relevanceFactor: relevanceFactor(FIXTURE_RELEVANCE[post.externalId] ?? null),
    opportunityScoreWithRelevance: opportunityScoreWithRelevance(score, post.createdTimestamp, risk, FIXTURE_RELEVANCE[post.externalId] ?? null, NOW),
    // version 3, appended again: relevance-aware freshness decay (docs/OPPORTUNITY-SCORING.md).
    freshnessDecayPerHour: freshnessDecayPerHour(FIXTURE_RELEVANCE[post.externalId] ?? null),
    freshnessRelevanceAware: opportunityFreshnessForRelevance(post.createdTimestamp, FIXTURE_RELEVANCE[post.externalId] ?? null, NOW),
    opportunityScoreRelevanceAware: opportunityScoreRelevanceAware(score, post.createdTimestamp, risk, FIXTURE_RELEVANCE[post.externalId] ?? null, NOW),
  };
});

// Opportunity ordering: threshold 70, then score DESC, createdTimestamp DESC.
const ranked = [...scored].sort(
  (left, right) => right.opportunityScore - left.opportunityScore || right.ageSeconds - left.ageSeconds,
);
const pool = ranked.filter((item) => item.opportunityScore >= 70);
// Select diverse candidates from the top 24.
const selectedIds = new Set(selectDiverseCandidates(pool.slice(0, 24), 6).map((item) => item.externalId));

// version 2: the same chain over the relevance-aware score (jev_mode "on"). Every
// version-1 field above is computed from the untouched legacy path.
const rankedWithRelevance = [...scored].sort(
  (left, right) => right.opportunityScoreWithRelevance - left.opportunityScoreWithRelevance || right.ageSeconds - left.ageSeconds,
);
const poolWithRelevance = rankedWithRelevance.filter((item) => item.opportunityScoreWithRelevance >= 70);
const selectedWithRelevance = selectDiverseCandidates(poolWithRelevance.slice(0, 24), 6).map((item) => item.externalId);

// version 3: the live jev_mode "on" chain — relevance-aware freshness decay AND the
// relevanceFactor — at the pool threshold. Versions 1 and 2 above are untouched.
const POOL_THRESHOLD_V3 = 70;
const rankedRelevanceAware = [...scored].sort(
  (left, right) => right.opportunityScoreRelevanceAware - left.opportunityScoreRelevanceAware || right.ageSeconds - left.ageSeconds,
);
const poolRelevanceAware = rankedRelevanceAware.filter((item) => item.opportunityScoreRelevanceAware >= POOL_THRESHOLD_V3);
const selectedRelevanceAware = selectDiverseCandidates(poolRelevanceAware.slice(0, 24), 6).map((item) => item.externalId);

console.log(
  JSON.stringify(
    {
      snapshot: "opportunity-scoring",
      version: 3,
      now: NOW,
      fixtureCount: OPPORTUNITY_FIXTURE.length,
      opportunityThreshold: 70,
      poolSize: pool.length,
      selected: [...selectedIds],
      candidates: ranked.map((item) => ({ ...item, selected: selectedIds.has(item.externalId) })),
      poolSizeWithRelevance: poolWithRelevance.length,
      selectedWithRelevance,
      rankedWithRelevance: rankedWithRelevance.map((item) => item.externalId),
      poolThresholdRelevanceAware: POOL_THRESHOLD_V3,
      poolSizeRelevanceAware: poolRelevanceAware.length,
      selectedRelevanceAware,
      rankedRelevanceAware: rankedRelevanceAware.map((item) => item.externalId),
    },
    null,
    2,
  ),
);
