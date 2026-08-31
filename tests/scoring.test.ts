import { describe, expect, test } from "bun:test";
import { ageNormalizedOverperformance, clusterKey, historicalPerformanceScore, isCurrentOpportunity, isNumericalHit, observedEngagement, opportunityFreshness, opportunityScore, OPPORTUNITY_MAX_AGE_SECONDS, overperformance, scorePost, selectDiverseCandidates, snapshotAcceleration } from "@/server/scoring";
import { metricBreakdown } from "@/server/db";

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
