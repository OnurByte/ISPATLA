import { expect, test } from "bun:test";
import { aggregateLandingReport } from "../scripts/landing-report";

test("report groups retained signup and first draft timings without returning identities", () => {
  const report = aggregateLandingReport({ events: [], users: [
    { id: "private-a", createdAt: new Date("2027-01-15T08:00:00Z") },
    { id: "private-b", createdAt: new Date("2027-01-15T08:00:00Z") },
  ], drafts: [
    { ownerUserId: "private-a", createdAt: 1800000042 }, { ownerUserId: "private-a", createdAt: 1800000999 },
    { ownerUserId: "private-b", createdAt: 1800003700 },
  ] });
  expect(report.firstSavedDraft).toEqual([{ bucket: "under_1m", count: 1 }, { bucket: "1h_to_24h", count: 1 }]);
  expect(report.signups).toEqual([{ day: "2027-01-15", count: 2 }]);
  expect(JSON.stringify(report)).not.toContain("private-");
});

test("empty databases produce an empty aggregate report", () => {
  expect(aggregateLandingReport({ events: [], users: [], drafts: [] })).toEqual({ events: [], signups: [], firstSavedDraft: [] });
});
