import { expect, test } from "bun:test";
import { cadenceFor, istanbulDayKey } from "@/server/monitoring";

const target = { kind: "account" as const, hits: 0, uniqueResults: 0, results: 0, reviewed: 0, falsePositives: 0, duplicates: 0, burstUntil: 0 };

test("adaptive monitoring uses Istanbul day boundaries and burst cadence", () => {
  expect(istanbulDayKey(Date.UTC(2026, 7, 30, 21, 30))).toBe("2026-08-31");
  expect(cadenceFor({ ...target, burstUntil: 101 }, 100)).toEqual({ tier: "hot", intervalSeconds: 15 });
  expect(cadenceFor({ ...target, hits: 1, uniqueResults: 4 }, 100)).toEqual({ tier: "warm", intervalSeconds: 60 });
  expect(cadenceFor({ ...target, kind: "search_query", results: 100, duplicates: 90 }, 100)).toEqual({ tier: "cold", intervalSeconds: 900 });
});
