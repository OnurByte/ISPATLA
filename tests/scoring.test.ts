import { describe, expect, test } from "bun:test";
import { ageNormalizedOverperformance, clusterKey, freshnessDecayPerHour, historicalPerformanceScore, isCurrentOpportunity, isNumericalHit, LEGACY_FRESHNESS_DECAY_PER_HOUR, MAX_FRESHNESS_DECAY_PER_HOUR, metricBreakdown, MIN_FRESHNESS_DECAY_PER_HOUR, observedEngagement, opportunityFreshness, opportunityFreshnessForRelevance, opportunityScore, opportunityScoreRelevanceAware, opportunityScoreWithRelevance, OPPORTUNITY_MAX_AGE_SECONDS, overperformance, relevanceFactor, scorePost, selectDiverseCandidates, snapshotAcceleration } from "@/server/scoring";

describe("market scoring", () => {
  test("normalizes Turkish clusters and removes URLs", () => {
    expect(clusterKey("İstanbul'da yeni gelişme: https://example.com/haber"))
      .toBe("istanbul-yeni-gelişme");
  });

  test("gives high-engagement media a publishable score", () => {
    const result = scorePost({
      likes: 12_000,
      replies: 1_500,
      reposts: 4_000,
      quotes: 300,
      views: 2_000_000,
      createdTimestamp: Math.floor(Date.now() / 1000) - 30 * 60,
      mediaCount: 1,
      sensitive: false,
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reason).toStartWith("deterministic:");
  });

  test("keeps ordinary high-engagement posts distinguishable below the score ceiling", () => {
    const now = Math.floor(Date.now() / 1000);
    const base = {
      replies: 20,
      reposts: 0,
      quotes: 0,
      views: 50_000,
      createdTimestamp: now - 15 * 60,
      mediaCount: 1,
      sensitive: false,
      followers: 100_000,
    };
    const strong = scorePost({ ...base, likes: 250 });
    const exceptional = scorePost({ ...base, likes: 2_500 });

    expect(strong.score).toBeLessThan(exceptional.score);
    expect(strong.score).toBeLessThan(100);
  });

  test("rewards engagement relative to the source audience", () => {
    const shared = {
      likes: 100,
      replies: 20,
      reposts: 30,
      quotes: 10,
      views: 10_000,
      createdTimestamp: Math.floor(Date.now() / 1000) - 30 * 60,
      mediaCount: 0,
      sensitive: false,
    };
    expect(scorePost({ ...shared, followers: 1_000 }).score).toBeGreaterThan(scorePost({ ...shared, followers: 1_000_000 }).score);
  });

  test("marks sensitive content in the score reason", () => {
    const result = scorePost({
      likes: 0,
      replies: 0,
      reposts: 0,
      quotes: 0,
      views: 0,
      createdTimestamp: Math.floor(Date.now() / 1000) - 15 * 60,
      mediaCount: 0,
      sensitive: true,
    });

    expect(result.score).toBe(0);
    expect(result.reason).toContain("sensitive=true");
  });

  test("keeps automatic candidates diverse by source and event cluster", () => {
    const selected = selectDiverseCandidates([
      { sourceHandle: "one", clusterKey: "same", id: 1 },
      { sourceHandle: "one", clusterKey: "other", id: 2 },
      { sourceHandle: "two", clusterKey: "same", id: 3 },
      { sourceHandle: "three", clusterKey: "third", id: 4 },
    ], 3);
    expect(selected.map((item) => item.id)).toEqual([1, 4]);
  });

  test("uses confirmed feedback only when it exists", () => {
    expect(historicalPerformanceScore([])).toBeNull();
    expect(historicalPerformanceScore([{ likes: 2_000, replies: 120, reposts: 400, quotes: 80, views: 100_000 }])).toBeGreaterThan(50);
  });

  test("keeps opportunities current and marks only fresh, low-risk numerical hits", () => {
    const now = 2_000_000;
    expect(isCurrentOpportunity(now - OPPORTUNITY_MAX_AGE_SECONDS, now)).toBe(true);
    expect(isCurrentOpportunity(now - OPPORTUNITY_MAX_AGE_SECONDS - 1, now)).toBe(false);
    expect(isNumericalHit(90, now - 2 * 60 * 60, 20, now)).toBe(true);
    expect(isNumericalHit(90, now - 2 * 60 * 60 - 1, 20, now)).toBe(false);
    expect(isNumericalHit(90, now - 60, 35, now)).toBe(false);
    expect(observedEngagement({ likes: 10, replies: 2, reposts: 3, quotes: 1, createdTimestamp: now - 3600, followers: 1_000, now })).toEqual({ engagements: 16, velocity: 16, rate: 0.016 });
  });

  test("multiplies opportunity momentum by freshness", () => {
    const now = 2_000_000;
    const createdAt = now - 16.25 * 60 * 60;
    expect(opportunityFreshness(createdAt, now)).toBe(35);
    expect(opportunityScore(100, createdAt, 15, now)).toBe(35);
    expect(opportunityScore(100, now - 15 * 60, 15, now)).toBeGreaterThanOrEqual(99);
    expect(opportunityScore(100, now - 15 * 60, 70, now)).toBe(0);
  });

  test("keeps public analytics ratios explicit and safe when views are absent", () => {
    expect(metricBreakdown({ likes: 10, replies: 2, reposts: 3, quotes: 1, views: 0, pollVotes: 4 })).toMatchObject({
      engagements: 16,
      engagementRate: 0,
      replyRate: 0,
      repostRate: 0,
      quoteRate: 0,
      pollVotes: 4,
    });
  });

  test("does not convert partial snapshots into acceleration or overperformance", () => {
    const before = { likes: 1, replies: 1, reposts: 1, quotes: 1, views: 10, capturedAt: 1, quality: "ok" as const };
    const after = { ...before, likes: 5, capturedAt: 11 };
    expect(snapshotAcceleration(before, after)).toBe(0.4);
    expect(snapshotAcceleration(before, { ...after, views: null, quality: "partial" })).toBeNull();
    expect(overperformance(20, 5)).toBe(4);
    expect(overperformance(20, null)).toBeNull();
  });

  test("only computes age-normalized overperformance from complete metrics and a baseline", () => {
    const snapshot = { likes: 12, replies: 4, reposts: 3, quotes: 1, views: 100, capturedAt: 120, quality: "ok" as const };
    expect(ageNormalizedOverperformance(snapshot, { engagement: 10, views: 80 })).toBe(2);
    expect(ageNormalizedOverperformance({ ...snapshot, quality: "partial" }, { engagement: 10, views: 80 })).toBeNull();
    expect(ageNormalizedOverperformance(snapshot, null)).toBeNull();
  });
});

describe("layered relevance score", () => {
  const now = 1_750_000_000;
  const fresh = now - 600;

  test("treats missing relevance as the legacy path and clamps the factor to [0.5, 1.5]", () => {
    expect(relevanceFactor(null)).toBe(1);
    expect(relevanceFactor(Number.NaN)).toBe(1);
    expect(relevanceFactor(0)).toBe(0.5);
    expect(relevanceFactor(50)).toBe(1);
    expect(relevanceFactor(100)).toBe(1.5);
    expect(relevanceFactor(-40)).toBe(0.5);
    expect(relevanceFactor(400)).toBe(1.5);
  });

  test("null relevance reproduces opportunityScore exactly", () => {
    for (const momentum of [0, 37, 70, 93, 100]) {
      for (const age of [0, 3600, 20 * 3600, 30 * 3600]) {
        expect(opportunityScoreWithRelevance(momentum, now - age, 15, null, now))
          .toBe(opportunityScore(momentum, now - age, 15, now));
      }
    }
  });

  test("is monotonic in relevance and stays inside 0-100", () => {
    const scores = [0, 25, 50, 75, 100].map((relevance) => opportunityScoreWithRelevance(80, fresh, 15, relevance, now));
    for (let index = 1; index < scores.length; index += 1) expect(scores[index]).toBeGreaterThanOrEqual(scores[index - 1]);
    expect(scores[0]).toBeLessThan(scores.at(-1)!);
    for (const score of scores) expect(score).toBeGreaterThanOrEqual(0);
    for (const score of scores) expect(score).toBeLessThanOrEqual(100);
    expect(opportunityScoreWithRelevance(100, now, 15, 100, now)).toBe(100);
  });

  test("never revives a post the deterministic gate already zeroed", () => {
    expect(opportunityScoreWithRelevance(100, fresh, 100, 100, now)).toBe(0);
    expect(opportunityScoreWithRelevance(100, now - 30 * 3600, 15, 100, now)).toBe(0);
  });
});

describe("relevance-aware freshness", () => {
  const now = 1_750_000_000;
  const hoursAgo = (hours: number) => now - Math.round(hours * 3600);

  test("scales the decay rate between 6 and 2 points per hour", () => {
    expect(freshnessDecayPerHour(null)).toBe(LEGACY_FRESHNESS_DECAY_PER_HOUR);
    expect(freshnessDecayPerHour(Number.NaN)).toBe(LEGACY_FRESHNESS_DECAY_PER_HOUR);
    expect(freshnessDecayPerHour(0)).toBe(MAX_FRESHNESS_DECAY_PER_HOUR);
    expect(freshnessDecayPerHour(20)).toBe(MAX_FRESHNESS_DECAY_PER_HOUR);
    expect(freshnessDecayPerHour(-50)).toBe(MAX_FRESHNESS_DECAY_PER_HOUR);
    expect(freshnessDecayPerHour(80)).toBe(MIN_FRESHNESS_DECAY_PER_HOUR);
    expect(freshnessDecayPerHour(100)).toBe(MIN_FRESHNESS_DECAY_PER_HOUR);
    expect(freshnessDecayPerHour(400)).toBe(MIN_FRESHNESS_DECAY_PER_HOUR);
    // Linear in between: 50 sits halfway between 6 and 2.
    expect(freshnessDecayPerHour(50)).toBeCloseTo(4, 10);
    expect(freshnessDecayPerHour(35)).toBeCloseTo(5, 10);
    expect(freshnessDecayPerHour(65)).toBeCloseTo(3, 10);
  });

  test("decay is monotonically non-increasing in relevance", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let relevance = 0; relevance <= 100; relevance += 5) {
      const decay = freshnessDecayPerHour(relevance);
      expect(decay).toBeLessThanOrEqual(previous);
      previous = decay;
    }
  });

  test("null relevance reproduces opportunityFreshness and the 24h window is unchanged", () => {
    for (const hours of [0, 0.5, 6, 18, 23.9, 25]) {
      expect(opportunityFreshnessForRelevance(hoursAgo(hours), null, now)).toBe(opportunityFreshness(hoursAgo(hours), now));
    }
    // Relevance slows decay inside the window; it never extends the window.
    expect(opportunityFreshnessForRelevance(hoursAgo(25), 100, now)).toBe(0);
    expect(opportunityFreshnessForRelevance(now - OPPORTUNITY_MAX_AGE_SECONDS - 1, 100, now)).toBe(0);
    expect(opportunityFreshnessForRelevance(hoursAgo(19), 100, now)).toBe(62);
    expect(opportunityFreshnessForRelevance(hoursAgo(19), 0, now)).toBe(0);
  });

  test("null relevance keeps opportunityScoreRelevanceAware byte-identical to the legacy score", () => {
    for (const momentum of [0, 37, 70, 76, 93, 100]) {
      for (const hours of [0, 1, 6, 19, 23, 30]) {
        for (const risk of [0, 15, 45, 70, 100]) {
          expect(opportunityScoreRelevanceAware(momentum, hoursAgo(hours), risk, null, now))
            .toBe(opportunityScore(momentum, hoursAgo(hours), risk, now));
        }
      }
    }
  });

  test("a 19h old highly relevant post survives while a fresh irrelevant one does not", () => {
    // The motivating case: momentum 76, 19h old, relevance 100.
    expect(opportunityScoreWithRelevance(76, hoursAgo(19), 15, 100, now)).toBeLessThan(40);
    expect(opportunityScoreRelevanceAware(76, hoursAgo(19), 15, 100, now)).toBeGreaterThanOrEqual(70);
    // A fresh but irrelevant post loses the pool place it used to take.
    expect(opportunityScore(76, hoursAgo(0.2), 15, now)).toBeGreaterThanOrEqual(70);
    expect(opportunityScoreRelevanceAware(76, hoursAgo(0.2), 15, 10, now)).toBeLessThan(70);
  });

  test("stays inside 0-100, honours the risk gate and is monotonic in relevance", () => {
    expect(opportunityScoreRelevanceAware(100, hoursAgo(1), 100, 100, now)).toBe(0);
    expect(opportunityScoreRelevanceAware(100, hoursAgo(1), 70, 100, now)).toBe(0);
    expect(opportunityScoreRelevanceAware(100, now, 15, 100, now)).toBe(100);
    const scores = [0, 20, 40, 60, 80, 100].map((relevance) => opportunityScoreRelevanceAware(80, hoursAgo(6), 15, relevance, now));
    for (let index = 1; index < scores.length; index += 1) expect(scores[index]).toBeGreaterThanOrEqual(scores[index - 1]);
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
