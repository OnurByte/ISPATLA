import { expect, test } from "bun:test";

test("observation validation rejects missing provenance before database access", async () => {
  const { upsertXObservation } = await import("../src/server/event-store");
  await expect(upsertXObservation({ xPostId: "", authorId: "", authorHandle: "", observedAt: 0, postCreatedAt: 0, textSnapshot: "", metrics: { capturedAt: 0, likes: null, replies: null, reposts: null, quotes: null, views: null }, readerProvider: "", rawHash: "" })).rejects.toThrow("𝕏 observation requires post, author, provider, and raw provenance");
});

test("baselines preserve missingness and censored metrics and resist one extreme observation", async () => {
  const { robustMetricBaseline } = await import("../src/server/event-intelligence");
  const result = robustMetricBaseline([
    { metrics: { views: 100 } }, { metrics: { views: 110 } }, { metrics: { views: 90 } }, { metrics: { views: 1000 } },
    { metrics: { views: null } }, { metrics: { views: 0 }, censored: ["views"] },
  ], "views");
  expect(result.median).toBe(105); expect(result.mad).toBe(10); expect(result.available).toBe(4);
  expect(result.missing).toBe(1); expect(result.censored).toBe(1); expect(result.coverage).toBeCloseTo(4 / 6);
  expect(robustMetricBaseline([{ metrics: { views: null } }], "views").median).toBeNull();
});

test("emergence, lifecycle, lineage and source-topic shrinkage discount self-amplifying evidence", async () => {
  const { classifyEventLifecycle, classifyEvidencePattern, scoreSourceTopicReputation } = await import("../src/server/event-intelligence");
  const independent = Array.from({ length: 5 }, (_, i) => ({ xPostId: `p${i}`, authorId: `a${i}`, authorHandle: `a${i}`, observedAt: 1000 + i * 30, textSnapshot: `Distinct report ${i}`, urls: [], referencedPosts: [] }));
  const broadcast = independent.map((item, i) => ({ ...item, referencedPosts: i === 0 ? [] : [{ kind: "repost_of" as const, xPostId: "root" }] }));
  expect(classifyEvidencePattern(broadcast).classification).toBe("broadcast");
  const coordinated = independent.map((item, i) => ({ ...item, xPostId: `c${i}`, textSnapshot: "Breaking: exact copied claim", observedAt: 1000 + i * 10 }));
  const coordination = classifyEvidencePattern(coordinated); expect(coordination.classification).toBe("coordinated_cluster"); expect(coordination.independenceWeight).toBeLessThan(.5);
  expect(classifyEventLifecycle({ observations: independent, now: 1100 }).confidence).toBe("insufficient");
  const emergent = classifyEventLifecycle({ observations: independent, now: 1100, historicalRateMedian: 0, historicalRateMad: 0, historicalSamples: 25 });
  expect(emergent.emergence).not.toBeNull(); expect(emergent.windows.map((w) => w.seconds)).toEqual([120, 300, 600, 1200, 3600, 21600, 86400]);
  expect(scoreSourceTopicReputation([{ sourceHandle: "small", topicId: "policy", eventFamilyId: "root-1", outcome: "useful", leadSeconds: 30 }], { alpha: 2, beta: 2 })[0].posterior).toBe(.6);
  const duplicated = scoreSourceTopicReputation([
    { sourceHandle: "small", topicId: "policy", eventFamilyId: "root-1", outcome: "useful", leadSeconds: 30 },
    { sourceHandle: "small", topicId: "policy", eventFamilyId: "root-1", outcome: "false_positive", leadSeconds: 20 },
    { sourceHandle: "small", topicId: "policy", eventFamilyId: "root-1", outcome: "false_positive", leadSeconds: 20, coordinationLikelihood: .9 },
  ], { alpha: 2, beta: 2 })[0];
  expect(duplicated.rawSignals).toBe(3); expect(duplicated.independentFamilies).toBe(1); expect(duplicated.effectiveSampleSize).toBe(1); expect(duplicated.posterior).toBeCloseTo(.4952380952);
});

test("hand-labeled X lineage fixture reports exact shadow classification quality", async () => {
  const { classifyEvidencePattern } = await import("../src/server/event-intelligence");
  const make = (id: string, author: string, text: string, observedAt: number, root?: string) => ({ xPostId: id, authorId: author, authorHandle: author, textSnapshot: text, observedAt, urls: [], referencedPosts: root ? [{ kind: "repost_of" as const, xPostId: root }] : [] });
  const fixtures = [
    { label: "broadcast", items: [make("b1", "a1", "first broadcast", 1), make("b2", "a2", "second amplification", 2, "root"), make("b3", "a3", "third amplification", 3, "root"), make("b4", "a4", "fourth amplification", 4, "root")] },
    { label: "organic_cascade", items: [make("c1", "c1", "independent report alpha", 1), make("c2", "c2", "independent report beta", 2), make("c3", "c3", "independent report gamma", 3)] },
    { label: "coordinated_cluster", items: [make("x1", "x1", "exact copied announcement text", 10), make("x2", "x2", "exact copied announcement text", 20), make("x3", "x3", "exact copied announcement text", 30)] },
    { label: "mixed", items: [make("m1", "m1", "shared family item one", 1), make("m2", "m2", "shared family item two", 2, "shared-root"), make("m3", "m3", "independent item", 3, "shared-root")] },
    { label: "unknown", items: [make("u1", "u1", "single observation", 1)] },
  ] as const;
  const confusion: Record<string, Record<string, number>> = {}; let correct = 0;
  for (const fixture of fixtures) { const predicted = classifyEvidencePattern(fixture.items).classification; confusion[fixture.label] ??= {}; confusion[fixture.label][predicted] = (confusion[fixture.label][predicted] || 0) + 1; if (predicted === fixture.label) correct++; }
  expect(correct).toBe(fixtures.length); expect(correct / fixtures.length).toBe(1); expect(confusion).toEqual(Object.fromEntries(fixtures.map((item) => [item.label, { [item.label]: 1 }])));
});
