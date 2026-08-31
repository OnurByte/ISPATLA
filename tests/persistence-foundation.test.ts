import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blueCheckStatusFromRecord } from "../src/server/db";

function runIsolatedDatabase(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-db-"));
  const database = join(directory, "state.sqlite3");
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: database },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("normalizes FxTwitter verification types without treating organization badges as blue", () => {
  expect([
    blueCheckStatusFromRecord({ verification: { verified: true, type: "individual" } }),
    blueCheckStatusFromRecord({ verification: { verified: true, type: "organization" } }),
    blueCheckStatusFromRecord({ verification: { verified: false, type: "individual" } }),
    blueCheckStatusFromRecord({ verification: { verified: true, type: "unknown" } }),
  ]).toEqual(["blue", "organization", "not_verified", "unknown"]);
});

test("persists editable automation schedules and redacts automation log secrets", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getAutomationLogs, getAutomationSchedules, recordAutomationLog, saveAutomationSchedule } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const defaults = getAutomationSchedules(1000);
    const saved = saveAutomationSchedule({ id: "source_scan", enabled: false, intervalSeconds: 600, nextRunAt: 5000, now: 1001 });
    recordAutomationLog({ taskId: "queue_worker", status: "partial", startedAt: 1002, finishedAt: 1003, message: "api_key=secret auth_token=token", details: { cookie: "secret-cookie", attempted: 0 } });
    console.log(JSON.stringify({ ids: defaults.map((item) => item.id), allDated: defaults.every((item) => item.nextRunAt > 0), saved, log: getAutomationLogs(1)[0] }));
  `);
  const result = JSON.parse(output);
  expect(result.ids).toEqual(["monitor_engine", "source_scan", "source_liveness", "queue_worker", "reconciliation"]);
  expect(result.allDated).toBe(true);
  expect(result.saved).toMatchObject({ id: "source_scan", enabled: false, intervalSeconds: 600, nextRunAt: 5000 });
  expect(JSON.stringify(result.log)).not.toContain("secret");
  expect(JSON.stringify(result.log)).toContain("[redacted]");
});

test("does not delete a source when a feed or profile response names another author", () => {
  const output = runIsolatedDatabase(`
    import { writeFileSync } from "node:fs";
    import { dirname, join } from "node:path";
    import { checkSourceLiveness, scanOnce } from "./src/server/pipeline.ts";
    import { ensureDatabase, getStoredSources } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const sourceFile = join(dirname(process.env.ISPATLA_DB!), "sources.json");
    writeFileSync(sourceFile, JSON.stringify({ sources: [{ handle: "foxnews", name: "Fox News", enabled: true, maxPosts: 20, profile: { origin: "manual", status: "active", pinned: true } }] }));
    process.env.ISPATLA_SOURCES = sourceFile;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/statuses")) return new Response(JSON.stringify({ results: [{ type: "status", id: "123", text: "Fox News post", author: { screen_name: "foxandfriends" } }] }));
      return new Response(JSON.stringify({ user: { screen_name: "foxandfriends", name: "Fox & Friends" } }));
    }) as typeof fetch;
    try {
      const scan = await scanOnce();
      const liveness = await checkSourceLiveness(1000);
      console.log(JSON.stringify({ scan, liveness, sources: getStoredSources().map((source) => ({ handle: source.handle, name: source.name, identityHandle: source.profile.identityHandle })) }));
    } finally { globalThis.fetch = previousFetch; }
  `);
  const result = JSON.parse(output);
  expect(result.sources).toEqual([{ handle: "foxnews", name: "Fox News" }]);
  expect(result.scan.sourcesDeleted).toBe(0);
  expect(result.liveness.deleted).toBe(0);
  expect(result.liveness.identityWarnings).toBe(1);
});

test("keeps a source when the reader reports a missing profile", () => {
  const output = runIsolatedDatabase(`
    import { writeFileSync } from "node:fs";
    import { dirname, join } from "node:path";
    import { checkSourceLiveness } from "./src/server/pipeline.ts";
    import { ensureDatabase, getStoredSources } from "./src/server/db.ts";
    import { loadSources } from "./src/server/sources.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const sourceFile = join(dirname(process.env.ISPATLA_DB!), "sources.json");
    writeFileSync(sourceFile, JSON.stringify({ sources: [{ handle: "foxnews", name: "Fox News", enabled: true, maxPosts: 20, profile: { origin: "manual", status: "active", pinned: true } }] }));
    process.env.ISPATLA_SOURCES = sourceFile;
    loadSources();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("404 Not Found"); }) as typeof fetch;
    try {
      const liveness = await checkSourceLiveness(1000);
      console.log(JSON.stringify({ liveness, handles: getStoredSources().map((source) => source.handle) }));
    } finally { globalThis.fetch = previousFetch; }
  `);
  expect(JSON.parse(output)).toEqual({
    liveness: { checked: 1, alive: 0, deleted: 0, unreachable: 1, identityWarnings: 1 },
    handles: ["foxnews"],
  });
});

test("does not delete a candidate merely because discovery evidence is old", () => {
  const output = runIsolatedDatabase(`
    import { writeFileSync } from "node:fs";
    import { dirname, join } from "node:path";
    import { scanOnce } from "./src/server/pipeline.ts";
    import { ensureDatabase, getStoredSources } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const sourceFile = join(dirname(process.env.ISPATLA_DB!), "sources.json");
    writeFileSync(sourceFile, JSON.stringify({ sources: [{ handle: "candidate", name: "Candidate", enabled: false, maxPosts: 20, profile: { origin: "discovered", status: "candidate", evidenceWeight: 1, lastEvidenceAt: 1 } }] }));
    process.env.ISPATLA_SOURCES = sourceFile;
    process.env.OPENAI_API_KEY = "test";
    try {
      const result = await scanOnce();
      console.log(JSON.stringify({ deleted: result.sourcesDeleted, handles: getStoredSources().map((source) => source.handle) }));
    } finally { delete process.env.OPENAI_API_KEY; }
  `);
  expect(JSON.parse(output)).toEqual({ deleted: 0, handles: ["candidate"] });
});

test("removes a restored source from the deleted-source view", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getDeletedSources, recordSourceEvent } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    recordSourceEvent({ handle: "foxnews", event: "deleted", score: 0, reason: "feed profil kimliği eşleşmedi: @foxandfriends", model: "", now: 1 });
    recordSourceEvent({ handle: "foxnews", event: "restored", score: 0, reason: "identity mismatch auto-fix", model: "source-restore", now: 2 });
    console.log(JSON.stringify(getDeletedSources()));
  `);
  expect(JSON.parse(output)).toEqual([]);
});

test("recovers technical removals and protects Elon Musk plus Fox News", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getDeletedSources, getStoredSources, recordSourceEvent } from "./src/server/db.ts";
    import { recoverTechnicalSources } from "./src/server/pipeline.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    recordSourceEvent({ handle: "openai", event: "deleted", score: 0, reason: "profil kimliği eşleşmedi: @openaı", model: "liveness-check", now: 1 });
    recordSourceEvent({ handle: "elonmusk", event: "deleted", score: 0, reason: "kişisel ve polemikli", model: "codex", now: 1 });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ user: { screen_name: "OPENAI", name: "OpenAI" } }))) as typeof fetch;
    try {
      const result = await recoverTechnicalSources(1000);
      console.log(JSON.stringify({ result, sources: getStoredSources().map((source) => ({ handle: source.handle, name: source.name, enabled: source.enabled, pinned: source.profile.pinned })), deleted: getDeletedSources() }));
    } finally { globalThis.fetch = previousFetch; }
  `);
  expect(JSON.parse(output)).toEqual({
    result: { recovered: 3, unresolved: 0 },
    sources: [
      { handle: "elonmusk", name: "Elon Musk", enabled: true, pinned: true },
      { handle: "foxnews", name: "Fox News", enabled: true, pinned: true },
      { handle: "openai", name: "openai", enabled: true, pinned: false },
    ],
    deleted: [],
  });
});

test("separates technical source warnings from actual removals", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getDeletedSources, getTechnicalSourceWarnings, recordSourceEvent } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    recordSourceEvent({ handle: "foxnews", event: "deleted", score: 0, reason: "feed profil kimliği eşleşmedi: @foxandfriends", model: "", now: 1 });
    recordSourceEvent({ handle: "manual", event: "deleted", score: 0, reason: "manual delete", model: "", now: 2 });
    console.log(JSON.stringify({ deleted: getDeletedSources().map((item) => item.handle), warnings: getTechnicalSourceWarnings().map((item) => item.handle) }));
  `);
  expect(JSON.parse(output)).toEqual({ deleted: ["manual"], warnings: ["foxnews"] });
});

test("stores manual publisher tier history without inferring a tier from the public badge", () => {
  const output = runIsolatedDatabase(`
    import { accountSubscriptionEvidence, ensureDatabase, getAccounts, saveAccount } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", xuseAccountId: "publisher", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, subscriptionHistory: [{ tier: "free", effectiveAt: 100 }, { tier: "premium", effectiveAt: 200 }], now: 300 });
    let duplicate = "";
    try { saveAccount({ ...account, subscriptionHistory: [{ tier: "free", effectiveAt: 100 }, { tier: "premium", effectiveAt: 100 }], now: 300 }); } catch (error) { duplicate = error instanceof Error ? error.message : String(error); }
    console.log(JSON.stringify({ history: getAccounts()[0]?.subscriptionHistory.map((event) => [event.tier, event.effectiveAt]), evidence: accountSubscriptionEvidence(account.id, 300), duplicate }));
  `);
  const result = JSON.parse(output);
  expect(result.history).toEqual([["free", 100], ["premium", 200]]);
  expect(result.evidence).toMatchObject({ currentTier: "premium", previousTier: "free", eligible: false, bonus: 0 });
  expect(result.duplicate).toBe("subscription başlangıç tarihi tekrarlanamaz");
});

test("keeps x-use observations separate from unverified subscription start dates", () => {
  const output = runIsolatedDatabase(`
    import { accountSubscriptionEvidence, ensureDatabase, getAccounts, recordAccountSubscriptionSync, saveAccount } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", xuseAccountId: "publisher", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now: 300 });
    recordAccountSubscriptionSync({ accountId: account.id, tier: "premium", observedAt: 300 });
    recordAccountSubscriptionSync({ accountId: account.id, tier: "premium", observedAt: 400, history: [{ tier: "free", effectiveAt: 100 }, { tier: "premium", effectiveAt: 200 }] });
    recordAccountSubscriptionSync({ accountId: account.id, tier: "premium", observedAt: 500 });
    const current = getAccounts()[0];
    const exact = accountSubscriptionEvidence(account.id, 500);
    recordAccountSubscriptionSync({ accountId: account.id, tier: "basic", observedAt: 600 });
    console.log(JSON.stringify({ state: current.subscriptionState, history: current.subscriptionHistory.map((event) => [event.tier, event.effectiveAt]), exact, changed: accountSubscriptionEvidence(account.id, 600) }));
  `);
  const result = JSON.parse(output);
  expect(result.state).toEqual({ tier: "premium", observedAt: 500, historyComplete: false });
  expect(result.history).toEqual([["free", 100], ["premium", 200]]);
  expect(result.exact).toMatchObject({ currentTier: "premium", previousTier: "free" });
  expect(result.changed).toMatchObject({ currentTier: "basic", previousTier: null, bonus: 0 });
});

test("unlocks the subscription tie-break only after matched before-and-after evidence", () => {
  const output = runIsolatedDatabase(`
    import { accountSubscriptionEvidence, ensureDatabase, recordAccountMetric, recordFeedbackSnapshot, recordPublishAttempt, saveAccount } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const start = 1_700_000_000;
    const switchedAt = start + 35 * 86400;
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", xuseAccountId: "publisher", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, subscriptionHistory: [{ tier: "free", effectiveAt: start }, { tier: "premium", effectiveAt: switchedAt }], now: switchedAt + 35 * 86400 });
    for (const period of ["before", "after"]) for (let index = 0; index < 30; index++) {
      const capturedAt = (period === "before" ? start : switchedAt) + index * 86400;
      const externalId = period + index;
      recordAccountMetric({ accountId: account.id, followers: 1000, following: 1, statuses: 1, likes: 1, mediaCount: 0, now: capturedAt });
      recordPublishAttempt({ externalId, accountId: account.id, status: "confirmed", reason: "test", receipt: "", now: capturedAt });
      recordFeedbackSnapshot({ externalId, accountId: account.id, likes: 10, replies: 0, reposts: 0, quotes: 0, views: period === "before" ? 100 : 200, milestone: "60dk", now: capturedAt });
    }
    console.log(JSON.stringify(accountSubscriptionEvidence(account.id, switchedAt + 35 * 86400)));
  `);
  expect(JSON.parse(output)).toMatchObject({ currentTier: "premium", previousTier: "free", currentSamples: 30, previousSamples: 30, currentWeeks: 5, previousWeeks: 5, lift: 1, eligible: true, bonus: 5 });
});

test("initializes versioned migrations and preserves an observation's first-seen time", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { ensureDatabase, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const post = {
      externalId: "123", sourceHandle: "source", authorHandle: "source",
      statusUrl: "https://x.com/source/status/123", text: "test post", createdTimestamp: 1,
      likes: 1, replies: 0, reposts: 0, quotes: 0, views: 1, mediaCount: 0,
      mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "test"
    };
    upsertPost(post, 100);
    upsertPost({ ...post, likes: 9 }, 200);
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify({
      version: db.query("SELECT version FROM schema_migrations").get()?.version,
      post: db.query("SELECT first_seen_at, last_seen_at, last_metrics_at, reader_received_at FROM observed_posts WHERE external_id='123'").get()
    }));
  `);
  expect(JSON.parse(output)).toEqual({
    version: 1,
    post: { first_seen_at: 100, last_seen_at: 200, last_metrics_at: 200, reader_received_at: 200 },
  });
});

test("fresh databases omit chat tables and persist monitor plus publication intent state", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { claimMonitorRun, createDraft, createPublicationIntent, ensureDatabase, finishBudgetRun, getMonitorBudgetUsage, getPublicationIntent, saveAccount, upsertMonitorTarget } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "main", handle: "main", displayName: "Main", xuseAccountId: "main", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: [], styleProfile: {}, now: 1 });
    const draft = createDraft({ externalId: "", accountId: account.id, format: "post", text: "test", now: 2 });
    const intent = createPublicationIntent({ draftId: draft.id, accountId: account.id, text: "test", idempotencyKey: "test-key", now: 3 });
    const target = upsertMonitorTarget({ kind: "keyword", key: "test", query: "test", now: 4 });
    const run = claimMonitorRun({ targetId: target.id, dayKey: "2026-08-31", bucket: "hot_categories", now: 5, dailyBudget: 1 });
    if (!run) throw new Error("budget run was not claimed");
    finishBudgetRun(run, "success", 6);
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify({ chat: db.query("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'chat_%'").get(), intent: getPublicationIntent(intent.id), budget: getMonitorBudgetUsage("2026-08-31") }));
  `);
  const result = JSON.parse(output);
  expect(result.chat.count).toBe(0);
  expect(result.intent).toMatchObject({ status: "pending_approval", idempotencyKey: "test-key" });
  expect(result.budget).toMatchObject({ hot_categories: 1, total: 1 });
});

test("migration leaves pre-existing chat tables untouched", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    const legacy = new Database(process.env.ISPATLA_DB, { create: true });
    legacy.exec("CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)");
    legacy.close();
    const { ensureDatabase } = await import("./src/server/db.ts");
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(Boolean(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'").get()));
  `);
  expect(output).toBe("true");
});

test("returns plain database rows that can cross a Server-to-Client boundary", () => {
  const output = runIsolatedDatabase(`
    import { getRecentPosts, ensureDatabase, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    upsertPost({ externalId: "plain", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "plain" }, 1);
    console.log(Object.getPrototypeOf(getRecentPosts()[0]) === Object.prototype);
  `);
  expect(output).toBe("true");
});

test("does not silently cap the opportunity inbox at fifty rows", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getOpportunityItems, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = Math.floor(Date.now() / 1000);
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: now, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 90, scoreReason: "deterministic:{\\\"momentum\\\":90,\\\"risk\\\":0}", sensitive: false };
    for (let id = 1; id <= 51; id++) upsertPost({ ...base, externalId: String(id), clusterKey: "cluster-" + id }, now);
    console.log(getOpportunityItems().length);
  `);
  expect(output).toBe("51");
});

test("separates last-day observed, eligible, rejected, and sensitive posts", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getMarketInbox, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = 2_000_000;
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", clusterKey: "cluster" };
    upsertPost({ ...base, externalId: "eligible", createdTimestamp: now - 15 * 60, score: 90, scoreReason: "deterministic:{\\\"momentum\\\":90,\\\"risk\\\":15}", sensitive: false }, now);
    upsertPost({ ...base, externalId: "low", createdTimestamp: now - 15 * 60, score: 60, scoreReason: "deterministic:{\\\"momentum\\\":60,\\\"risk\\\":45}", sensitive: false }, now);
    upsertPost({ ...base, externalId: "expired", createdTimestamp: now - 25 * 60 * 60, score: 100, scoreReason: "deterministic:{\\\"momentum\\\":100,\\\"risk\\\":15}", sensitive: false }, now);
    upsertPost({ ...base, externalId: "sensitive", createdTimestamp: now - 15 * 60, score: 0, scoreReason: "deterministic:{\\\"momentum\\\":0,\\\"risk\\\":100}", sensitive: true }, now);
    const page = (view) => getMarketInbox({ view, now, limit: 10, offset: 0 });
    console.log(JSON.stringify({
      counts: page("observed").counts,
      observed: page("observed").items.map((item) => [item.externalId, item.decision]),
      opportunities: page("opportunities").items.map((item) => item.externalId),
      rejected: page("rejected").items.map((item) => [item.externalId, item.decision]),
      sensitive: page("sensitive").items.map((item) => item.externalId),
    }));
  `);
  expect(JSON.parse(output)).toEqual({
    counts: { opportunities: 1, observed: 3, rejected: 2, sensitive: 1 },
    observed: [["eligible", "opportunity"], ["low", "below_threshold"], ["expired", "expired"]],
    opportunities: ["eligible"],
    rejected: [["low", "below_threshold"], ["expired", "expired"]],
    sensitive: ["sensitive"],
  });
});

test("recalculates visible legacy scores with the current scorer", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getMarketInbox, getRecentPosts, recalculateRecentScores, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = Math.floor(Date.now() / 1000);
    upsertPost({ externalId: "legacy", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: now - 15 * 60, likes: 250, replies: 20, reposts: 0, quotes: 0, views: 50_000, followers: 100_000, mediaCount: 1, mediaJson: "[]", rawJson: "{}", score: 100, scoreReason: "deterministic:{\\\"momentum\\\":100,\\\"risk\\\":15}", sensitive: false, clusterKey: "legacy" }, now);
    const recalculated = recalculateRecentScores(now);
    console.log(JSON.stringify({ recalculated, score: getRecentPosts(1)[0].score, velocity: getMarketInbox({ view: "observed", now, limit: 1 }).items[0].velocity }));
  `);
  expect(JSON.parse(output)).toEqual({ recalculated: 1, score: 83, velocity: 1080 });
});

test("shows only measured monitor rates and ranks observed targets first", () => {
  const output = runIsolatedDatabase(`
    import { claimMonitorRun, ensureDatabase, finishMonitorRun, getMonitoringPerformance, upsertMonitorTarget } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const idle = upsertMonitorTarget({ kind: "account", key: "idle", sourceHandle: "idle", now: 100 });
    const active = upsertMonitorTarget({ kind: "account", key: "active", sourceHandle: "active", now: 100 });
    const runId = claimMonitorRun({ targetId: active.id, dayKey: "2026-08-31", bucket: "exploration", now: 100 });
    if (!runId) throw new Error("run missing");
    finishMonitorRun({ runId, targetId: active.id, status: "success", returned: 10, uniqueResults: 5, hits: 1, duplicates: 2, intervalSeconds: 60, tier: "warm", now: 110 });
    console.log(JSON.stringify(getMonitoringPerformance(2).map((item) => ({ key: item.key, runs: item.runs, hitYield: item.hitYield, duplicateRate: item.duplicateRate }))));
  `);
  expect(JSON.parse(output)).toEqual([
    { key: "active", runs: 1, hitYield: 0.2, duplicateRate: 0.2 },
    { key: "idle", runs: 0, hitYield: null, duplicateRate: null },
  ]);
});

test("uses freshness-adjusted score for the opportunity inbox and automatic candidates", () => {
  const output = runIsolatedDatabase(`
    import { candidates, ensureDatabase, getCategories, getOpportunityItems, opportunityCount, saveSourceCategoryConfig, upsertPost, upsertSource } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = Math.floor(Date.now() / 1000);
    upsertSource({ handle: "source", name: "Source", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: {} }, now);
    const news = getCategories().find((item) => item.slug === "news");
    if (!news) throw new Error("news missing");
    saveSourceCategoryConfig({ sourceHandle: "source", categoryId: news.id, monitoringTier: "A", discoveryWeight: 1, categoryReputation: null, enabled: true, lastEvidenceAt: now });
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 100, scoreReason: "deterministic:{\\\"momentum\\\":100,\\\"risk\\\":15}", sensitive: false };
    upsertPost({ ...base, externalId: "fresh", clusterKey: "fresh", createdTimestamp: now - 15 * 60 }, now);
    upsertPost({ ...base, externalId: "stale", clusterKey: "stale", createdTimestamp: now - 16.25 * 60 * 60 }, now);
    upsertPost({ ...base, externalId: "legacy", clusterKey: "legacy", createdTimestamp: now - 15 * 60, scoreReason: "hybrid:{\\\"momentum\\\":100,\\\"risk\\\":0}" }, now);
    console.log(JSON.stringify({ opportunities: getOpportunityItems().map((post) => post.externalId), count: opportunityCount(now), candidates: candidates(12, now).map((post) => post.externalId) }));
  `);
  expect(JSON.parse(output)).toEqual({ opportunities: ["fresh"], count: 1, candidates: ["fresh"] });
});

test("persists source reader high-watermarks and explicit gaps", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getSourceReaderCursor, recordSourceReaderCursor } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    recordSourceReaderCursor({ sourceHandle: "source", lastSeenPostId: "100", lastSeenCreatedAt: 50, paginationCursor: "", gapDetected: true, lastSuccessAt: 60 });
    console.log(JSON.stringify(getSourceReaderCursor("source")));
  `);
  expect(JSON.parse(output)).toEqual({ sourceHandle: "source", lastSeenPostId: "100", lastSeenCreatedAt: 50, paginationCursor: "", gapDetected: true, lastSuccessAt: 60 });
});

test("fails closed for publishing when the reader is stale or has an unresolved gap", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, readerPublishingReady, recordReaderHealth, recordSourceReaderCursor } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    recordReaderHealth({ transport: "fxtwitter", ok: true, checkedAt: 100 });
    const healthy = readerPublishingReady(200);
    recordSourceReaderCursor({ sourceHandle: "wire", lastSeenPostId: "1", lastSeenCreatedAt: 1, paginationCursor: "", gapDetected: true, lastSuccessAt: 100 });
    console.log(JSON.stringify({ healthy, gap: readerPublishingReady(200), stale: readerPublishingReady(800) }));
  `);
  expect(JSON.parse(output)).toEqual({ healthy: true, gap: false, stale: false });
});

test("records missing raw metrics as nullable partial snapshots", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { ensureDatabase, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    upsertPost({ externalId: "metrics", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: JSON.stringify({ likes: 2, replies: 1, retweets: 3, quotes: 4, author: { followers: 10 } }), score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "metrics" }, 2);
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify(db.query("SELECT likes, replies, reposts, quotes, views, followers, metric_quality AS quality FROM post_metric_snapshots").get()));
  `);
  expect(JSON.parse(output)).toEqual({ likes: 2, replies: 1, reposts: 3, quotes: 4, views: null, followers: 10, quality: "partial" });
});

test("aggregates cluster metrics without turning missing observations into zero", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { ensureDatabase, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" };
    upsertPost({ ...base, externalId: "1", rawJson: JSON.stringify({ likes: 3, replies: 2, reposts: 1, quotes: 0, views: 50 }) }, 10);
    upsertPost({ ...base, externalId: "2", rawJson: "{}" }, 11);
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify(db.query("SELECT post_count AS postCount, likes, replies, reposts, quotes, views, metric_quality AS quality FROM cluster_metric_snapshots ORDER BY id DESC LIMIT 1").get()));
  `);
  expect(JSON.parse(output)).toEqual({ postCount: 2, likes: 3, replies: 2, reposts: 1, quotes: 0, views: 50, quality: "partial" });
});

test("computes a source and category baseline only from complete age-matched snapshots", () => {
  const output = runIsolatedDatabase(`
    import { classifyCluster, ensureDatabase, sourceCategoryMetricBaseline, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" };
    for (let id = 1; id <= 5; id++) {
      upsertPost({ ...base, externalId: String(id), rawJson: JSON.stringify({ likes: id, replies: 1, reposts: 1, quotes: 1, views: id * 10, author: { followers: 100 } }) }, id * 1_000);
      classifyCluster("shared", "event", ["news"], id * 1_000);
      upsertPost({ ...base, externalId: String(id), rawJson: JSON.stringify({ likes: id * 2, replies: 1, reposts: 1, quotes: 1, views: id * 20, author: { followers: 100 } }) }, id * 1_000 + 120);
    }
    console.log(JSON.stringify(sourceCategoryMetricBaseline("source", ["news"], 120, 10_000)));
  `);
  expect(JSON.parse(output)).toEqual({ sampleCount: 5, engagement: 9, views: 60, ageSeconds: 120 });
});

test("uses the defined metric milestones without repeatedly polling a completed one", () => {
  const output = runIsolatedDatabase(`
    import { METRIC_SNAPSHOT_MILESTONES, nextMetricSnapshotAt } from "./src/server/db.ts";
    console.log(JSON.stringify({ milestones: METRIC_SNAPSHOT_MILESTONES, first: nextMetricSnapshotAt(0, 0, 120), due: nextMetricSnapshotAt(1000, 1000, 1301), next: nextMetricSnapshotAt(1000, 1301, 1301) }));
  `);
  expect(JSON.parse(output)).toEqual({ milestones: [120, 300, 600, 1200, 3600], first: null, due: 1120, next: null });
});

test("persists cluster multi-labels and a kind reclassification audit", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { classifyCluster, ensureDatabase, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    upsertPost({ externalId: "1", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" }, 1);
    classifyCluster("shared", "topic", ["news", "technology"], 2);
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify({ labels: db.query("SELECT COUNT(*) AS count FROM cluster_categories").get().count, audit: db.query("SELECT to_kind AS kind FROM cluster_audits").get().kind }));
  `);
  expect(JSON.parse(output)).toEqual({ labels: 2, audit: "topic" });
});

test("merges unpublished clusters and records the audit without moving publications", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { ensureDatabase, mergeClusters, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false };
    upsertPost({ ...base, externalId: "1", clusterKey: "from" }, 1); upsertPost({ ...base, externalId: "2", clusterKey: "into" }, 1);
    mergeClusters("from", "into", 2);
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify({ clusters: db.query("SELECT COUNT(*) AS count FROM opportunity_clusters").get().count, moved: db.query("SELECT cluster_key AS key FROM observed_posts WHERE external_id='1'").get().key, audit: db.query("SELECT action FROM cluster_audits ORDER BY id DESC LIMIT 1").get().action }));
  `);
  expect(JSON.parse(output)).toEqual({ clusters: 1, moved: "into", audit: "merge" });
});

test("keeps point-in-time scored decisions including non-selected candidates", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { ensureDatabase, recordDecision, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    upsertPost({ externalId: "1", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" }, 1);
    recordDecision({ externalId: "1", clusterKey: "shared", accountIds: [1, 2], categories: ["news"], score: 30, selected: false, reasonCode: "scored_below_threshold", now: 2 });
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify(db.query("SELECT selected, reason_code AS reason, candidate_account_ids_json AS accounts FROM decision_records").get()));
  `);
  expect(JSON.parse(output)).toEqual({ selected: 0, reason: "scored_below_threshold", accounts: "[1,2]" });
});

test("creates cluster account opportunities before any publication attempt", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { ensureDatabase, getCategories, recordAccountOpportunities, saveAccount, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "one", handle: "one", displayName: "One", xuseAccountId: "one", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: [], now: 1 });
    upsertPost({ externalId: "1", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" }, 1);
    recordAccountOpportunities({ clusterKey: "shared", accountIds: [account.id], categorySlugs: ["news"], score: 73, confidence: 80, now: 2 });
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify(db.query("SELECT status, expected_incremental_reach AS score, publish_confidence AS confidence FROM account_opportunities").get()));
  `);
  expect(JSON.parse(output)).toEqual({ status: "candidate", score: 73, confidence: 80 });
});

test("does not create account opportunities for unmatched categories", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { ensureDatabase, recordAccountOpportunities, saveAccount, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "one", handle: "one", displayName: "One", xuseAccountId: "one", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: [], styleProfile: { categories: ["news"] }, now: 1 });
    upsertPost({ externalId: "1", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" }, 1);
    recordAccountOpportunities({ clusterKey: "shared", accountIds: [account.id], categorySlugs: ["meme"], score: 73, confidence: 80, accountProfiles: [], now: 2 });
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(db.query("SELECT COUNT(*) AS count FROM account_opportunities").get().count);
  `);
  expect(output).toBe("0");
});

test("keeps future automation jobs untouched until their scheduled time", () => {
  const output = runIsolatedDatabase(`
    import { createDraft, createJob, ensureDatabase, getJobs } from "./src/server/db.ts";
    import { runDueAutomationJobs } from "./src/server/queue-service.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const draft = createDraft({ externalId: "future", format: "post", text: "future", now: 100 });
    createJob({ draftId: draft.id, action: "post", scheduledAt: 200, now: 100 });
    const result = await runDueAutomationJobs(150);
    console.log(JSON.stringify({ result, status: getJobs()[0]?.status }));
  `);
  expect(JSON.parse(output)).toEqual({ result: [], status: "queued" });
});

test("does not run due automation jobs while the global pause is active", () => {
  const output = runIsolatedDatabase(`
    import { createDraft, createJob, ensureDatabase, getJobs, setSetting } from "./src/server/db.ts";
    import { runDueAutomationJobs } from "./src/server/queue-service.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const draft = createDraft({ externalId: "paused", format: "post", text: "paused", now: 100 });
    createJob({ draftId: draft.id, action: "post", scheduledAt: 100, now: 100 });
    setSetting("automation_paused", "1", 100);
    const result = await runDueAutomationJobs(150);
    console.log(JSON.stringify({ result, status: getJobs()[0]?.status }));
  `);
  expect(JSON.parse(output)).toEqual({ result: [], status: "queued" });
});

test("records one account-specific publication per cluster opportunity", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { confirmPublish, ensureDatabase, recordPublishAttempt, saveAccount, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({
      accountKey: "publisher", handle: "publisher", displayName: "Publisher", xuseAccountId: "publisher",
      enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], now: 1
    });
    const post = {
      externalId: "456", sourceHandle: "source", authorHandle: "source",
      statusUrl: "https://x.com/source/status/456", text: "test post", createdTimestamp: 1,
      likes: 1, replies: 0, reposts: 0, quotes: 0, views: 1, mediaCount: 0,
      mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "same-cluster"
    };
    upsertPost(post, 100);
    recordPublishAttempt({ externalId: "456", accountId: account.id, status: "pending_reconciliation", reason: "queued", receipt: "", remoteUrl: "https://x.com/publisher/status/999", now: 101 });
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    confirmPublish(db.query("SELECT id FROM publish_attempts").get().id, "456");
    console.log(JSON.stringify({
      opportunities: db.query("SELECT COUNT(*) AS count FROM account_opportunities").get(),
      publication: db.query("SELECT COUNT(*) AS count, remote_post_id AS remotePostId, status FROM publications").get(),
    }));
  `);
  expect(JSON.parse(output)).toEqual({
    opportunities: { count: 1 },
    publication: { count: 1, remotePostId: "999", status: "confirmed" },
  });
});

test("publication deduplication is scoped to the selected account", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, hasPublishedCluster, recordPublishAttempt, saveAccount, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const base = { displayName: "Publisher", xuseAccountId: "publisher", enabled: true, defaultAccount: false, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], now: 1 };
    const one = saveAccount({ ...base, accountKey: "one", handle: "one" });
    const two = saveAccount({ ...base, accountKey: "two", handle: "two" });
    upsertPost({ externalId: "dedupe", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 1, replies: 0, reposts: 0, quotes: 0, views: 1, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" }, 1);
    recordPublishAttempt({ externalId: "dedupe", accountId: one.id, status: "pending_reconciliation", reason: "queued", receipt: "", now: 2 });
    console.log(JSON.stringify([hasPublishedCluster("shared", one.id), hasPublishedCluster("shared", two.id)]));
  `);
  expect(JSON.parse(output)).toEqual([true, false]);
});

test("pauses only an account with a recent repeated publishing failure", () => {
  const output = runIsolatedDatabase(`
    import { accountPublishingReady, ensureDatabase, recordPublishAttempt, saveAccount, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const first = saveAccount({ accountKey: "one", handle: "one", displayName: "One", xuseAccountId: "one", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: [], now: 1 });
    const second = saveAccount({ accountKey: "two", handle: "two", displayName: "Two", xuseAccountId: "two", enabled: true, defaultAccount: false, automationMode: "auto", dailyLimit: 24, capabilities: [], now: 1 });
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "shared" };
    for (let id = 1; id <= 3; id++) { upsertPost({ ...base, externalId: String(id) }, id); recordPublishAttempt({ externalId: String(id), accountId: first.id, status: "blocked", reason: "publisher failed", receipt: "", now: 10 + id }); }
    console.log(JSON.stringify([accountPublishingReady(first.id, 100), accountPublishingReady(second.id, 100)]));
  `);
  expect(JSON.parse(output)).toEqual([false, true]);
});

test("stores feedback against the confirmed account publication", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    import { confirmPublish, createDraft, createJob, ensureDatabase, recordFeedbackSnapshot, recordPublishAttempt, saveAccount, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({
      accountKey: "publisher", handle: "publisher", displayName: "Publisher", xuseAccountId: "publisher",
      enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], now: 1
    });
    upsertPost({ externalId: "789", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/789", text: "test post", createdTimestamp: 1, likes: 1, replies: 0, reposts: 0, quotes: 0, views: 1, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "feedback-cluster" }, 100);
    const draft = createDraft({ externalId: "789", accountId: account.id, format: "post", text: "draft", status: "queued", now: 100 });
    createJob({ draftId: draft.id, accountId: account.id, action: "post", scheduledAt: 100, now: 100 });
    recordPublishAttempt({ externalId: "789", accountId: account.id, status: "pending_reconciliation", reason: "queued", receipt: "", remoteUrl: "https://x.com/publisher/status/998", now: 101 });
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    confirmPublish(db.query("SELECT id FROM publish_attempts").get().id, "789");
    recordFeedbackSnapshot({ externalId: "789", accountId: account.id, remotePostId: "998", likes: 12, replies: 3, reposts: 4, quotes: 5, views: 600, milestone: "confirmed", now: 200 });
    console.log(JSON.stringify({
      publication: db.query("SELECT publication_metric_snapshots.remote_post_id AS remotePostId, likes, replies, reposts, quotes, views, milestone FROM publication_metric_snapshots JOIN publications ON publications.id=publication_metric_snapshots.publication_id").get(),
      job: db.query("SELECT status, reconciliation_status FROM automation_jobs").get(),
    }));
  `);
  expect(JSON.parse(output)).toEqual({
    publication: { remotePostId: "998", likes: 12, replies: 3, reposts: 4, quotes: 5, views: 600, milestone: "confirmed" },
    job: { status: "confirmed", reconciliation_status: "confirmed" },
  });
});

test("persists a real custom category and rejects an unbounded factual category", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getCategories, saveCategory } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const custom = saveCategory({
      slug: "monero", name: "Monero", enabled: true, builtIn: false, baseStrategy: "technology", clusterStrategy: "topic",
      verificationMode: "moderate", description: "Monero and privacy ecosystem", positiveExamples: ["Monero protocol"], negativeExamples: [],
      keywords: ["monero", "xmr"], excludedKeywords: [], seedHandles: ["monero"], defaultFormats: ["post"],
      sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {}, aiContext: "privacy coin", now: 10
    });
    let invalid = "";
    try {
      saveCategory({ ...custom, id: undefined, slug: "unsafe-politics", name: "Unsafe Politics", builtIn: false, baseStrategy: "politics", clusterStrategy: "event", verificationMode: "none", description: "unsafe", positiveExamples: ["claim"], now: 11 });
    } catch (error) { invalid = error instanceof Error ? error.message : String(error); }
    const templates = getCategories().filter((category) => category.slug === "magazin" || category.slug === "troll");
    console.log(JSON.stringify({ builtIn: getCategories().filter((category) => category.builtIn).length, custom, invalid, templates }));
  `);
  const result = JSON.parse(output);
  expect(result.builtIn).toBe(11);
  expect(result.custom).toMatchObject({ slug: "monero", builtIn: false, keywords: ["monero", "xmr"] });
  expect(result.invalid).toBe("factual category doğrulamasız çalışamaz");
  expect(result.templates).toEqual([
    expect.objectContaining({ slug: "magazin", baseStrategy: "entertainment", verificationMode: "moderate", riskPolicy: expect.objectContaining({ rumor: "block" }) }),
    expect.objectContaining({ slug: "troll", baseStrategy: "shitpost", verificationMode: "minimal", riskPolicy: expect.objectContaining({ fabricatedFact: "block" }) }),
  ]);
});

test("uses a single enabled primary category per account", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getAccountCategoryConfigs, getCategories, saveAccount, saveAccountCategoryConfig } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", xuseAccountId: "publisher", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], now: 1 });
    const categories = getCategories();
    const news = categories.find((item) => item.slug === "news");
    const meme = categories.find((item) => item.slug === "meme");
    if (!news || !meme) throw new Error("built-in categories missing");
    saveAccountCategoryConfig({ accountId: account.id, categoryId: news.id, enabled: true, primary: true, weight: 1, priority: 2, publishThreshold: 70, dailyBudget: 8, styleOverride: {}, aiRouteOverride: {} });
    saveAccountCategoryConfig({ accountId: account.id, categoryId: meme.id, enabled: true, primary: true, weight: 0.5, priority: 1, publishThreshold: null, dailyBudget: null, styleOverride: {}, aiRouteOverride: {} });
    console.log(JSON.stringify(getAccountCategoryConfigs(account.id)));
  `);
  expect(JSON.parse(output)).toEqual([
    expect.objectContaining({ categorySlug: "meme", primary: true, publishThreshold: null }),
    expect.objectContaining({ categorySlug: "news", primary: false, publishThreshold: 70, dailyBudget: 8 }),
  ]);
});

test("rejects account categories outside the canonical catalog", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, saveAccount } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    let error = "";
    try {
      saveAccount({ accountKey: "invalid", handle: "invalid", displayName: "Invalid", xuseAccountId: "", enabled: true, defaultAccount: false, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], styleProfile: { categories: ["not-a-category"] }, now: 1 });
    } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    console.log(JSON.stringify(error));
  `);
  expect(JSON.parse(output)).toBe("account kategorileri katalogdan seçilmeli");
});

test("counts account category budgets independently", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, recentCategoryPublishCount, recordPublishAttempt, saveAccount, upsertPost } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "one", handle: "one", displayName: "One", xuseAccountId: "one", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: [], now: 1 });
    const base = { sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "test", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 80, sensitive: false, clusterKey: "c" };
    upsertPost({ ...base, externalId: "n", scoreReason: 'hybrid:{"categories":["news"]}' }, 100);
    upsertPost({ ...base, externalId: "m", scoreReason: 'hybrid:{"categories":["meme"]}', clusterKey: "d" }, 100);
    recordPublishAttempt({ externalId: "n", accountId: account.id, status: "confirmed", reason: "", receipt: "", now: 101 });
    recordPublishAttempt({ externalId: "m", accountId: account.id, status: "confirmed", reason: "", receipt: "", now: 101 });
    console.log(JSON.stringify({ news: recentCategoryPublishCount(200, account.id, "news"), meme: recentCategoryPublishCount(200, account.id, "meme") }));
  `);
  expect(JSON.parse(output)).toEqual({ news: 1, meme: 1 });
});

test("persists source category policy without accepting invalid weights", () => {
  const output = runIsolatedDatabase(`
    import { ensureDatabase, getCategories, getSourceCategoryConfigs, saveSourceCategoryConfig, upsertSource } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    upsertSource({ handle: "wire", name: "Wire", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: {} }, 1);
    const news = getCategories().find((item) => item.slug === "news");
    if (!news) throw new Error("news missing");
    const saved = saveSourceCategoryConfig({ sourceHandle: "wire", categoryId: news.id, monitoringTier: "A", discoveryWeight: 2, categoryReputation: 92, enabled: true, lastEvidenceAt: 10 });
    let invalid = "";
    try { saveSourceCategoryConfig({ ...saved, discoveryWeight: 11 }); } catch (error) { invalid = error instanceof Error ? error.message : String(error); }
    console.log(JSON.stringify({ saved, listed: getSourceCategoryConfigs("wire"), invalid }));
  `);
  const result = JSON.parse(output);
  expect(result.saved).toMatchObject({ sourceHandle: "wire", categorySlug: "news", monitoringTier: "A", categoryReputation: 92 });
  expect(result.listed).toHaveLength(1);
  expect(result.invalid).toBe("discovery weight geçersiz");
});

test("migrates recognized legacy account category tags without inventing custom categories", () => {
  const output = runIsolatedDatabase(`
    import { Database } from "bun:sqlite";
    const legacy = new Database(process.env.ISPATLA_DB, { strict: true });
    legacy.run("CREATE TABLE accounts (id INTEGER PRIMARY KEY, account_key TEXT NOT NULL UNIQUE, handle TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT '', xuse_account_id TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, default_account INTEGER NOT NULL DEFAULT 0, automation_mode TEXT NOT NULL DEFAULT 'manual', daily_limit INTEGER NOT NULL DEFAULT 24, capabilities_json TEXT NOT NULL DEFAULT '[]', style_profile_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL); INSERT INTO accounts (id, account_key, handle, style_profile_json, updated_at) VALUES (7, 'legacy', 'legacy', '{\\\"categories\\\":[\\\"haber\\\",\\\"magazin\\\",\\\"uydurma\\\"]}', 1);");
    const { ensureDatabase, getAccountCategoryConfigs, getCategories } = await import("./src/server/db.ts");
    if (!ensureDatabase()) throw new Error("database did not initialize");
    console.log(JSON.stringify({ configs: getAccountCategoryConfigs(7), custom: getCategories().filter((category) => !category.builtIn).length }));
  `);
  const result = JSON.parse(output);
  expect(result.configs).toEqual([
    expect.objectContaining({ categorySlug: "news", primary: true }),
    expect.objectContaining({ categorySlug: "entertainment", primary: false }),
  ]);
  expect(result.custom).toBe(0);
});
