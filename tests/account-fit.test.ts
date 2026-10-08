import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseAccountFit, isQuietHour, quietHoursConfiguration } from "../src/server/account-fit";
import type { Account, AccountCategoryConfig } from "../src/server/db";

function isolated(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-format-history-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", script], cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_SECRET_KEY: "format-history-test-key", ISPATLA_TOKEN_KEY_CURRENT: "format-history-token-key" }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

const account = (id: number, weight: number, capabilities: string[], withVoice = true): Account => ({
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
  const a = chooseAccountFit({ account: account(1, 1, ["post", "repost"]), category: "news", categoryConfig: config(1, 1), topicFatigue: 0, sourceFatigue: 0, budgetAvailable: true,
    formatEvidence: { post: { samples: 8, engagementRate: 8 }, repost: { samples: 8, engagementRate: 1 } }, capabilities: ["post", "repost"], sourceRights: "cleared", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: [] });
  const b = chooseAccountFit({ account: account(2, 5, ["post", "repost"]), category: "news", categoryConfig: config(2, 5), topicFatigue: 3, sourceFatigue: 4, budgetAvailable: true,
    formatEvidence: { post: { samples: 8, engagementRate: 1 }, repost: { samples: 8, engagementRate: 8 } }, capabilities: ["post", "repost"], sourceRights: "cleared", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: [] });
  expect(a.format).toBe("post");
  expect(b.format).toBe("repost");
  expect(a.score).not.toBe(b.score);
  expect(a.confidenceBasis).toBe("configured_category_voice_and_history");
});

test("reply needs official summon and quote stays denied; unknown risk never grants publish consent", () => {
  const result = chooseAccountFit({ account: account(3, 3, ["post", "reply", "quote"]), category: "news", categoryConfig: config(3, 3), topicFatigue: 0, sourceFatigue: null, budgetAvailable: true,
    formatEvidence: { reply: { samples: 9, engagementRate: 99 } }, capabilities: ["post", "reply", "quote"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: null });
  expect(result.format).toBe("post");
  expect(result.blocked.reply).toBe("official_reply_summon_missing");
  expect(result.blocked.quote).toBe("quote_entitlement_unknown");
  expect(result.riskTier).toBe("unknown");
  expect(result.publishConsent).toBe(false);
});

test("published cluster blocks post and repost suggestions", () => {
  const result = chooseAccountFit({ account: account(4, 3, ["post", "repost"]), category: "news", categoryConfig: config(4, 3), topicFatigue: 1, sourceFatigue: 1, budgetAvailable: true,
    formatEvidence: { repost: { samples: 12, engagementRate: 99 } }, capabilities: ["post", "repost"], sourceRights: "cleared", replySummoned: false, duplicate: true, now: 0, officialTimeOutcomes: null });
  expect(result.format).toBe(null);
  expect(result.blocked.post).toBe("duplicate_or_cluster_already_published");
  expect(result.blocked.repost).toBe("duplicate_or_cluster_already_published");
});

test("exhausted daily budget suppresses every format suggestion", () => {
  const result = chooseAccountFit({ account: account(5, 3, ["post", "repost", "reply"]), category: "news", categoryConfig: config(5, 3), topicFatigue: 0, sourceFatigue: 0, budgetAvailable: false,
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
  const invalidClock = chooseAccountFit({ account: { ...account(9, 3, ["post"]), styleProfile: { postingSchedule: { quietHours: { start: "22:00", end: "06:00", timeZone: "UTC" } } } },
    category: "news", categoryConfig: config(9, 3), topicFatigue: 0, sourceFatigue: 0, budgetAvailable: true,
    formatEvidence: {}, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: Number.NaN, officialTimeOutcomes: null });
  expect(invalidClock.timing.eligibility).toBe("quiet_hours_invalid");
  expect(invalidClock.timing.publishWindowOpen).toBe(false);
});

test("invalid configured quiet hours fail closed while missing configuration and outcomes stay unknown", () => {
  const malformed = chooseAccountFit({ account: { ...account(6, 3, ["post"]), styleProfile: { postingSchedule: { quietHours: { start: "25:00", end: "06:00", timeZone: "No/Such_Zone" } } } },
    category: "news", categoryConfig: config(6, 3), topicFatigue: null, sourceFatigue: null, budgetAvailable: true,
    formatEvidence: {}, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: 1_791_446_400, officialTimeOutcomes: null });
  expect(malformed.timing.eligibility).toBe("quiet_hours_invalid");
  expect(malformed.timing.publishWindowOpen).toBe(false);
  expect(malformed.timing.recommendedLocalHour).toBeNull();
  expect(malformed.timing.bestTimeReason).toBe("official_outcome_history_unavailable");
  const missing = chooseAccountFit({ account: account(7, 3, ["post"]), category: "news", categoryConfig: config(7, 3), topicFatigue: null, sourceFatigue: null, budgetAvailable: true,
    formatEvidence: {}, capabilities: ["post"], sourceRights: "unknown", replySummoned: false, duplicate: false, now: 0, officialTimeOutcomes: null });
  expect(missing.timing.eligibility).toBe("quiet_hours_unconfigured");
  expect(missing.timing.publishWindowOpen).toBeNull();
  expect(missing.timing.bestTimeReason).toBe("official_outcome_history_unavailable");
});

test("best local hour needs five official non-null-view outcomes and excludes quiet hours", () => {
  const accountWithSchedule = { ...account(8, 3, ["post"]), styleProfile: { postingSchedule: { quietHours: { start: "22:00", end: "06:00", timeZone: "UTC" } } } };
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

test("format recommendations ignore high legacy source feedback and use only mature official account outcomes", () => {
  const result = JSON.parse(isolated(`
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { ensureDatabase, recordFeedbackSnapshot, recordPublishAttempt, saveAccount } from "./src/server/db.ts";
    import { appendObservedOutcome, recordEvaluationPrediction } from "./src/server/evaluation-store.ts";
    import { formatHistoryEvidence } from "./src/server/draft-evaluator.ts";
    if (!ensureDatabase()) throw new Error("db unavailable");
    const now = Math.floor(Date.now() / 1000);
    runAsOwner("format-owner", () => {
      const account = saveAccount({ accountKey:"format-account",handle:"format",displayName:"Format",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:20,capabilities:["post","repost"],now });
      for (let i=0;i<5;i++) {
        const externalId = "legacy-source-" + i;
        recordPublishAttempt({ externalId, accountId:account.id, status:"confirmed", reason:"legacy-only", receipt:"", now:now-20_000+i });
        recordFeedbackSnapshot({ externalId, accountId:account.id, likes:1000, replies:1000, reposts:1000, quotes:1000, views:1, milestone:"legacy", now:now-19_000+i });
      }
      const legacyOnly = formatHistoryEvidence(account.id,"news",["post","repost"]);
      const publishedAt = now - 15*86400;
      for (let i=0;i<5;i++) {
        const createdAt = now - 20*86400;
        const prediction = recordEvaluationPrediction({ accountId:String(account.id), candidateId:"official-source-"+i+":decision:"+createdAt, leakageGroup:"official-source-"+i, modelKey:"decision-score-v1:news", rawScore:80, selectorVersion:"decision-score-v1", action:"repost", category:"news", format:"repost", riskTier:"unknown", features:{ decision:"eligible", sourceCandidateId:"official-source-"+i }, createdAt, resolveBy:createdAt+14*86400 });
        appendObservedOutcome({ predictionId:prediction.id, capturedAt:now, observedAt:now, metrics:{views:100,likes:10,replies:5,reposts:2,quotes:3}, source:"official_x_api", provenanceRef:"official_x:"+account.id+":"+(9000+i)+":published_at="+publishedAt });
      }
      console.log(JSON.stringify({ legacyOnly, official:formatHistoryEvidence(account.id,"news",["post","repost"]) }));
    });
  `));
  expect(result.legacyOnly.post).toEqual({ samples: 0, engagementRate: null });
  expect(result.legacyOnly.repost).toEqual({ samples: 0, engagementRate: null });
  expect(result.official.repost).toEqual({ samples: 5, engagementRate: 0.2 });
  expect(result.official.post).toEqual({ samples: 0, engagementRate: null });
});
