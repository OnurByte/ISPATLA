// Continuous-run surface: the pool threshold every account actually asked for, the
// single-writer automation lock, publishing_paused and the worker's env file.
//
// Database cases run in their own SQLite file in a child process (the pattern from
// tests/persistence-foundation.test.ts). Nothing here touches the network.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkerEnv, parseEnvFile } from "../scripts/worker-env";

function runIsolatedDatabase(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-worker-"));
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

/** Seeds one category, one account and the scoring fixture, then reports the pool. */
function poolScript(options: { publishThreshold: number | null; setting?: string; accountEnabled?: boolean; categoryEnabled?: boolean }): string {
  return `
    import {
      candidates, ensureDatabase, getCategories, opportunityCount, opportunityPoolThreshold,
      opportunityScoreForPost, saveAccount, saveAccountCategoryConfig, saveSourceCategoryConfig,
      setSetting, upsertPost, upsertSource,
    } from "./src/server/db.ts";
    import { scorePost } from "./src/server/scoring.ts";
    import { FIXTURE_NOW, OPPORTUNITY_FIXTURE } from "./tests/fixtures/opportunity-fixture.ts";

    const NOW = FIXTURE_NOW;
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const category = getCategories().find((item) => item.enabled);
    const account = saveAccount({
      accountKey: "nis", handle: "nis", displayName: "Nis", enabled: ${options.accountEnabled === false ? "false" : "true"}, defaultAccount: true, automationMode: "auto", dailyLimit: 24,
      capabilities: ["post"], styleProfile: { niche: "yapay zeka", categories: [category.slug] }, now: NOW,
    });
    saveAccountCategoryConfig({
      accountId: account.id, categoryId: category.id, enabled: ${options.categoryEnabled === false ? "false" : "true"}, primary: ${options.categoryEnabled === false ? "false" : "true"},
      weight: 1, priority: 1, publishThreshold: ${options.publishThreshold === null ? "null" : options.publishThreshold},
      dailyBudget: null, styleOverride: {}, aiRouteOverride: {},
    });
    ${options.setting === undefined ? "" : `setSetting("opportunity_pool_threshold", ${JSON.stringify(options.setting)}, NOW);`}

    for (const handle of [...new Set(OPPORTUNITY_FIXTURE.map((post) => post.sourceHandle))]) {
      upsertSource({ handle, name: handle, enabled: true, maxPosts: 10, rightsStatus: "unknown", profile: {} }, NOW);
      saveSourceCategoryConfig({ sourceHandle: handle, categoryId: category.id, monitoringTier: "A", discoveryWeight: 1, categoryReputation: null, enabled: true, lastEvidenceAt: 0 });
    }
    for (const post of OPPORTUNITY_FIXTURE) {
      const scored = scorePost({ ...post, now: NOW });
      upsertPost({
        externalId: post.externalId, sourceHandle: post.sourceHandle, authorHandle: post.authorHandle,
        statusUrl: "https://x.com/" + post.sourceHandle + "/status/" + post.externalId, text: post.text,
        createdTimestamp: post.createdTimestamp, likes: post.likes, replies: post.replies, reposts: post.reposts,
        quotes: post.quotes, views: post.views, followers: post.followers, mediaCount: post.mediaCount,
        mediaJson: "[]", rawJson: "{}", score: scored.score, scoreReason: scored.reason,
        sensitive: post.sensitive, clusterKey: post.clusterKey || post.externalId,
      }, NOW);
    }

    const pool = candidates(32, NOW);
    console.log(JSON.stringify({
      threshold: opportunityPoolThreshold(),
      pool: pool.map((post) => post.externalId),
      scores: pool.map((post) => opportunityScoreForPost(post, NOW)),
      opportunityCount: opportunityCount(NOW),
    }));
  `;
}

test("the pool threshold defaults to 70 and never exceeds the lowest enabled account threshold", () => {
  const base = JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: null })));
  expect(base.threshold).toBe(70);
  for (const score of base.scores) expect(score).toBeGreaterThanOrEqual(70);

  const niche = JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: 55 })));
  expect(niche.threshold).toBe(55);
  expect(niche.pool.length).toBeGreaterThan(base.pool.length);
  // Every post the strict pool held is still there, plus the ones the account asked for.
  for (const id of base.pool) expect(niche.pool).toContain(id);
  expect(Math.min(...niche.scores)).toBeLessThan(70);
  expect(Math.min(...niche.scores)).toBeGreaterThanOrEqual(55);
  // The pool is ordered by score, highest first.
  expect([...niche.scores].sort((left: number, right: number) => right - left)).toEqual(niche.scores);
  expect(niche.opportunityCount).toBeGreaterThanOrEqual(niche.pool.length);
});

test("opportunity_pool_threshold lowers the pool on its own and clamps to 0-100", () => {
  const lowered = JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: null, setting: "50" })));
  expect(lowered.threshold).toBe(50);
  expect(Math.min(...lowered.scores)).toBeGreaterThanOrEqual(50);

  // A setting above the account threshold loses: min() wins.
  const both = JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: 40, setting: "90" })));
  expect(both.threshold).toBe(40);

  // Garbage and out-of-range values fall back to the default / clamp.
  expect(JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: null, setting: "abc" }))).threshold).toBe(70);
  expect(JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: null, setting: "-10" }))).threshold).toBe(0);
  expect(JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: null, setting: "400" }))).threshold).toBe(100);
});

test("a disabled account or a disabled category mapping cannot lower the pool threshold", () => {
  expect(JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: 30, accountEnabled: false }))).threshold).toBe(70);
  expect(JSON.parse(runIsolatedDatabase(poolScript({ publishThreshold: 30, categoryEnabled: false }))).threshold).toBe(70);
});

test("the automation lock admits one writer, refreshes its own claim and expires", () => {
  const output = JSON.parse(runIsolatedDatabase(`
    import { AUTOMATION_LOCK_TTL_SECONDS, claimAutomationLock, ensureDatabase, readAutomationLock, releaseAutomationLock } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const NOW = 1750000000;
    const first = claimAutomationLock("worker", NOW, 111, "host");
    const second = claimAutomationLock("web", NOW + 5, 222, "host");
    const refresh = claimAutomationLock("worker", NOW + 30, 111, "host");
    const afterExpiry = claimAutomationLock("web", NOW + AUTOMATION_LOCK_TTL_SECONDS + 31, 222, "host");
    const beforeRelease = readAutomationLock(NOW + AUTOMATION_LOCK_TTL_SECONDS + 31);
    releaseAutomationLock("web", 222, NOW + AUTOMATION_LOCK_TTL_SECONDS + 32, "host");
    const afterRelease = readAutomationLock(NOW + AUTOMATION_LOCK_TTL_SECONDS + 33);
    const reclaimed = claimAutomationLock("worker", NOW + AUTOMATION_LOCK_TTL_SECONDS + 34, 333, "host");
    console.log(JSON.stringify({ first, second, refresh, afterExpiry, beforeRelease, afterRelease, reclaimed }));
  `));
  expect(output.first.ok).toBe(true);
  // A different owner is refused while the lock is fresh, and learns who holds it.
  expect(output.second.ok).toBe(false);
  expect(output.second.holder).toMatchObject({ owner: "worker", pid: 111 });
  // The same owner+pid refreshes its own heartbeat.
  expect(output.refresh.ok).toBe(true);
  // Past the TTL the stale lock is forgotten, so a killed process never blocks a start.
  expect(output.afterExpiry.ok).toBe(true);
  expect(output.beforeRelease).toMatchObject({ owner: "web", pid: 222 });
  expect(output.afterRelease).toBeNull();
  expect(output.reclaimed.ok).toBe(true);
});

test("publishing_paused stops publishing while monitor, scan and rank keep running", () => {
  const output = JSON.parse(runIsolatedDatabase(`
    import { ensureDatabase, setSetting } from "./src/server/db.ts";
    import { automationEnabled, publishingEnabled, publishingPaused } from "./src/server/pipeline.ts";
    import { runDueAutomationJobs } from "./src/server/queue-service.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const NOW = 1750000000;
    const clean = { automation: automationEnabled(), publishing: publishingEnabled(), paused: publishingPaused() };
    setSetting("publishing_paused", "1", NOW);
    const paused = { automation: automationEnabled(), publishing: publishingEnabled(), paused: publishingPaused(), jobs: (await runDueAutomationJobs(NOW)).length };
    setSetting("publishing_paused", "0", NOW);
    const resumed = { automation: automationEnabled(), publishing: publishingEnabled(), paused: publishingPaused() };
    console.log(JSON.stringify({ clean, paused, resumed }));
  `));
  expect(output.clean).toMatchObject({ automation: true, publishing: true, paused: false });
  // Scanning/monitoring stay enabled; only the publishing switch flips.
  expect(output.paused).toMatchObject({ automation: true, publishing: false, paused: true, jobs: 0 });
  expect(output.resumed).toMatchObject({ automation: true, publishing: true, paused: false });
});

test("the worker env file is parsed without clobbering the real environment", () => {
  expect(parseEnvFile([
    "# comment",
    "",
    "ISPATLA_DB=/tmp/state.sqlite3",
    'export JEV_API_KEY="secret-value"',
    "QUOTED='single'",
    "  SPACED = value with spaces  ",
    "no-equals-line",
    "1BAD=nope",
  ].join("\n"))).toEqual({
    ISPATLA_DB: "/tmp/state.sqlite3",
    JEV_API_KEY: "secret-value",
    QUOTED: "single",
    SPACED: "value with spaces",
  });

  const directory = mkdtempSync(join(tmpdir(), "ispatla-env-"));
  const file = join(directory, "worker.env");
  try {
    writeFileSync(file, "ISPATLA_DB=/from/file\nJEV_API_KEY=from-file\n");
    const env: Record<string, string | undefined> = { ISPATLA_DB: "/already/set" };
    const result = loadWorkerEnv(file, env);
    expect(result.found).toBe(true);
    expect(result.applied).toEqual(["JEV_API_KEY"]);
    expect(result.skipped).toEqual(["ISPATLA_DB"]);
    expect(env.ISPATLA_DB).toBe("/already/set");
    expect(env.JEV_API_KEY).toBe("from-file");
    // A missing file is not an error: systemd may have supplied everything already.
    const missing = loadWorkerEnv(join(directory, "absent.env"), {});
    expect(missing).toMatchObject({ found: false, applied: [], skipped: [] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
