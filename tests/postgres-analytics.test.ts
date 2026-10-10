import { expect, test } from "bun:test";
import { parseAnalyticsParams } from "../src/server/postgres-analytics";

test("analytics query validates account ownership selector shape and supported ranges", () => {
  expect(parseAnalyticsParams(new URLSearchParams())).toEqual({ rangeDays: 14 });
  expect(parseAnalyticsParams(new URLSearchParams("accountId=12&rangeDays=7"))).toEqual({ accountId: 12, rangeDays: 7 });
  expect(parseAnalyticsParams(new URLSearchParams("accountId=0"))).toBeNull();
  expect(parseAnalyticsParams(new URLSearchParams("accountId=1.5"))).toBeNull();
  expect(parseAnalyticsParams(new URLSearchParams("rangeDays=30"))).toBeNull();
});
