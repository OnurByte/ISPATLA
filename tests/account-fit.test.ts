import { expect, test } from "bun:test";
import { chooseAccountFit, isQuietHour, quietHoursConfiguration } from "../src/server/account-fit";
import type { Account, AccountCategoryConfig } from "../src/server/db-types";

const account = (id: number, capabilities: string[], withVoice = true): Account => ({
  id, ownerUserId: "owner", accountKey: `a${id}`, handle: `a${id}`, displayName: `A${id}`,
  enabled: true, defaultAccount: false, automationMode: "manual", dailyLimit: 5,
  capabilities, styleProfile: withVoice ? { voice: { version: 1 } } : {},
  subscriptionHistory: [], subscriptionState: { tier: "free", observedAt: 0, historyComplete: true }, updatedAt: 0,
});
const config = (accountId: number, weight: number): AccountCategoryConfig => ({
  accountId, categoryId: 1, categorySlug: "news", categoryName: "News", enabled: true,
  primary: true, weight, priority: 1, publishThreshold: null, dailyBudget: null,
  styleOverride: {}, aiRouteOverride: {},
});

test("same event gets account-specific fit and format from configured history", () => {
  const a = chooseAccountFit({ account: account(1, ["post", "repost"]), category: "news", categoryConfig: config(1, 1), topicFatigue: 0, sourceFatigue: 0, budgetAvailable: true,
    formatEvidence: { post: { samples: 8, engagementRate: 8 }, repost: { samples: 8, engagementRate: 1 } }, capabilities: ["post", "repost"], sourceRights: "cleared", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: [] });
  const b = chooseAccountFit({ account: account(2, ["post", "repost"]), category: "news", categoryConfig: config(2, 5), topicFatigue: 3, sourceFatigue: 4, budgetAvailable: true,
    formatEvidence: { post: { samples: 8, engagementRate: 1 }, repost: { samples: 8, engagementRate: 8 } }, capabilities: ["post", "repost"], sourceRights: "cleared", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: [] });
  expect(a.format).toBe("post");
  expect(b.format).toBe("repost");
  expect(a.score).not.toBe(b.score);
  expect(a.confidenceBasis).toBe("configured_category_voice_and_history");
});

test("legacy ideology labels do not affect account fit", () => {
  const make = (id: number, ideology: string): Account => ({
    ...account(id, ["post"]),
    styleProfile: { voice: { version: 1 }, ideology },
  });
  const input = (value: Account) => chooseAccountFit({ account: value, category: "news", categoryConfig: config(value.id, 3), topicFatigue: 1, sourceFatigue: 2, budgetAvailable: true,
    formatEvidence: { post: { samples: 7, engagementRate: 4 } }, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: null });
  expect(input(make(11, "secular"))).toEqual(input(make(12, "islamist")));
});

test("reply needs official summon and quote stays denied; unknown risk never grants publish consent", () => {
  const result = chooseAccountFit({ account: account(3, ["post", "reply", "quote"]), category: "news", categoryConfig: config(3, 3), topicFatigue: 0, sourceFatigue: null, budgetAvailable: true,
    formatEvidence: { reply: { samples: 9, engagementRate: 99 } }, capabilities: ["post", "reply", "quote"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: null });
  expect(result.format).toBe("post");
  expect(result.blocked.reply).toBe("official_reply_summon_missing");
  expect(result.blocked.quote).toBe("quote_entitlement_unknown");
  expect(result.riskTier).toBe("unknown");
  expect(result.publishConsent).toBe(false);
});

test("published cluster blocks post and repost suggestions", () => {
  const result = chooseAccountFit({ account: account(4, ["post", "repost"]), category: "news", categoryConfig: config(4, 3), topicFatigue: 1, sourceFatigue: 1, budgetAvailable: true,
    formatEvidence: { repost: { samples: 12, engagementRate: 99 } }, capabilities: ["post", "repost"], sourceRights: "cleared", replySummoned: false, duplicate: true, now: 0, officialTimeOutcomes: null });
  expect(result.format).toBe(null);
  expect(result.blocked.post).toBe("duplicate_or_cluster_already_published");
  expect(result.blocked.repost).toBe("duplicate_or_cluster_already_published");
});

test("exhausted daily budget suppresses every format suggestion", () => {
  const result = chooseAccountFit({ account: account(5, ["post", "repost", "reply"]), category: "news", categoryConfig: config(5, 3), topicFatigue: 0, sourceFatigue: 0, budgetAvailable: false,
    formatEvidence: { post: { samples: 10, engagementRate: 99 } }, capabilities: ["post", "repost", "reply"], sourceRights: "cleared", replySummoned: true, duplicate: false, now: 0, officialTimeOutcomes: null });
  expect(result.format).toBe(null);
  expect(result.blocked.post).toBe("daily_budget_exhausted");
  expect(result.blocked.repost).toBe("daily_budget_exhausted");
  expect(result.blocked.reply).toBe("daily_budget_exhausted");
});

test("quiet window wraps midnight and obeys both exact boundaries", () => {
  const window = quietHoursConfiguration({ postingSchedule: { quietHours: { start: "22:00", end: "06:00", timeZone: "UTC" } } });
  expect(window).not.toBeNull();
  expect(isQuietHour(21 * 60 + 59, window!)).toBe(false);
  expect(isQuietHour(22 * 60, window!)).toBe(true);
  expect(isQuietHour(5 * 60 + 59, window!)).toBe(true);
  expect(isQuietHour(6 * 60, window!)).toBe(false);
  const invalidClock = chooseAccountFit({ account: { ...account(9, ["post"]), styleProfile: { postingSchedule: { quietHours: { start: "22:00", end: "06:00", timeZone: "UTC" } } } },
    category: "news", categoryConfig: config(9, 3), topicFatigue: 0, sourceFatigue: 0, budgetAvailable: true,
    formatEvidence: {}, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: Number.NaN, officialTimeOutcomes: null });
  expect(invalidClock.timing.eligibility).toBe("quiet_hours_invalid");
  expect(invalidClock.timing.publishWindowOpen).toBe(false);
});

test("invalid configured quiet hours fail closed while missing configuration and outcomes stay unknown", () => {
  const malformed = chooseAccountFit({ account: { ...account(6, ["post"]), styleProfile: { postingSchedule: { quietHours: { start: "25:00", end: "06:00", timeZone: "No/Such_Zone" } } } },
    category: "news", categoryConfig: config(6, 3), topicFatigue: null, sourceFatigue: null, budgetAvailable: true,
    formatEvidence: {}, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: 1_791_446_400, officialTimeOutcomes: null });
  expect(malformed.timing.eligibility).toBe("quiet_hours_invalid");
  expect(malformed.timing.publishWindowOpen).toBe(false);
  expect(malformed.timing.recommendedLocalHour).toBeNull();
  expect(malformed.timing.bestTimeReason).toBe("official_outcome_history_unavailable");
  const missing = chooseAccountFit({ account: account(7, ["post"]), category: "news", categoryConfig: config(7, 3), topicFatigue: null, sourceFatigue: null, budgetAvailable: true,
    formatEvidence: {}, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: null });
  expect(missing.timing.eligibility).toBe("quiet_hours_unconfigured");
  expect(missing.timing.publishWindowOpen).toBeNull();
  expect(missing.timing.bestTimeReason).toBe("official_outcome_history_unavailable");
});

test("best local hour needs five official non-null-view outcomes and excludes quiet hours", () => {
  const accountWithSchedule = { ...account(8, ["post"]), styleProfile: { postingSchedule: { quietHours: { start: "22:00", end: "06:00", timeZone: "UTC" } } } };
  const publishedAt = (hour: number, day: number) => Math.floor(Date.UTC(2026, 0, day, hour) / 1000);
  const outcomes: { publishedAt: number; views: number | null }[] = [
    ...[1, 2, 3, 4, 5].map((day) => ({ publishedAt: publishedAt(13, day), views: 100 + day })),
    { publishedAt: publishedAt(23, 6), views: 10000 }, { publishedAt: publishedAt(14, 7), views: null },
  ];
  const result = chooseAccountFit({ account: accountWithSchedule, category: "news", categoryConfig: config(8, 3), topicFatigue: 0, sourceFatigue: 0, budgetAvailable: true,
    formatEvidence: {}, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: publishedAt(15, 8), officialTimeOutcomes: outcomes });
  expect(result.timing.recommendedLocalHour).toBe(13);
  expect(result.timing.bestTimeSamples).toBe(5);
  expect(result.timing.bestTimeReason).toBe("best_confirmed_official_views_by_local_hour");
});
