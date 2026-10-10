import { expect, test } from "bun:test";
import { fitIsotonicCalibration, reliabilityMetrics } from "../src/server/calibration";
import { splitLeakageGroup } from "../src/server/evaluation-store";

test("leakage-group split stays deterministic and keeps repeated group ids together", () => {
  const groups = ["event-a", "event-b", "event-c", "event-d", "event-e"];
  for (const group of groups) {
    expect(splitLeakageGroup(group)).toBe(splitLeakageGroup(group));
    expect(["train", "calibration", "holdout"]).toContain(splitLeakageGroup(group));
  }
  expect(() => splitLeakageGroup("  ")).toThrow("leakage group is required");
});

test("isotonic fitting drops conflicting leakage groups and produces a monotone mapping", () => {
  expect(fitIsotonicCalibration([
    { score: 0.1, hit: false, groupId: "g1" },
    { score: 0.2, hit: true, groupId: "g2" },
    { score: 0.3, hit: false, groupId: "g2" },
  ], 2)).toMatchObject({ status: "insufficient", sampleCount: 1, mapping: [] });

  const fitted = fitIsotonicCalibration([
    { score: 0.1, hit: true, groupId: "low" },
    { score: 0.5, hit: false, groupId: "middle" },
    { score: 0.9, hit: true, groupId: "high" },
  ], 3);
  expect(fitted.status).toBe("calibrated");
  expect(fitted.mapping.map((bin) => bin.probability)).toEqual([...fitted.mapping.map((bin) => bin.probability)].sort((a, b) => a - b));
});

test("reliability metrics deduplicate identical groups and exclude conflicting groups", () => {
  expect(reliabilityMetrics([
    { probability: 0.8, hit: true, groupId: "same" },
    { probability: 0.8, hit: true, groupId: "same" },
    { probability: 0.2, hit: true, groupId: "conflict" },
    { probability: 0.2, hit: false, groupId: "conflict" },
  ])).toMatchObject({ sampleCount: 1, brier: expect.any(Number) });
});
