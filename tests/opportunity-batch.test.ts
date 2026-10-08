// Faz B3 — pool x account batch ranking.
//
// Every case runs in its own SQLite database in a child process (the pattern from
// tests/persistence-foundation.test.ts) with an injected Jev transport, so no test
// ever reaches the network. The fake transport answers straight from the request
// body, which also proves the request shape the batch builds.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountFacet, dayKey, preferredRelevanceAccount, toJevCandidate, JEV_BATCH_QUERY } from "@/server/opportunity-batch";
import { buildJevRequestBody, jevConfig, jevFixedChars, jevPlanCandidateChunks, JEV_MAX_INPUT_CHARS } from "@/server/jev";
import type { Account, AccountCategoryConfig, CategoryDefinition } from "@/server/db";

const FIXTURE_NOW = 1_750_000_000;

function runIsolatedDatabase(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-batch-"));
  const database = join(directory, "state.sqlite3");
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: database, JEV_API_KEY: "jev-synthetic-test-key" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Seeds accounts, one category, the fixture sources and the fixture posts, injects a
 * transport and runs one batch. `options.relevance` maps accountIndex -> externalId ->
 * 0-100; `options.status` forces an HTTP status; `options.mode` is the jev_mode.
 */
function batchScript(options: {
  mode: string;
  accounts: number;
  relevance?: Record<number, Record<string, number>>;
  status?: number;
  cap?: string;
  callsToday?: string;
  body?: string;
  /** externalId rewritten from inside the transport, i.e. while the call is in flight. */
  drift?: string;
  /** Pads every post text so each candidate carries a full 400 char statement. */
  padText?: boolean;
}): string {
  return `
    import { Database } from "bun:sqlite";
    import {
      candidates, ensureDatabase, getAccountCategoryConfigs, getAccounts, getCategories,
      opportunityScoreForPost, saveAccount, saveAccountCategoryConfig, saveSourceCategoryConfig,
      setSetting, upsertPost, upsertSource,
    } from "./src/server/db.ts";
    import { setJevTransportForTests } from "./src/server/jev.ts";
    import { rankOpportunityBatch, dayKey } from "./src/server/opportunity-batch.ts";
    import { scorePost, selectDiverseCandidates } from "./src/server/scoring.ts";
    import { FIXTURE_NOW, OPPORTUNITY_FIXTURE } from "./tests/fixtures/opportunity-fixture.ts";

    const NOW = FIXTURE_NOW;
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const category = getCategories().find((item) => item.enabled);
    if (!category) throw new Error("no enabled category");

    for (let index = 0; index < ${options.accounts}; index += 1) {
      const account = saveAccount({
        accountKey: "acc" + index, handle: "acc" + index, displayName: "Hesap " + index,
        enabled: true, defaultAccount: index === 0,
        automationMode: "auto", dailyLimit: 24, capabilities: ["post"],
        styleProfile: { niche: "nis " + index, categories: [category.slug] }, now: NOW,
      });
      saveAccountCategoryConfig({
        accountId: account.id, categoryId: category.id, enabled: true, primary: true,
        weight: 1, priority: 1, publishThreshold: null, dailyBudget: null,
        styleOverride: {}, aiRouteOverride: {},
      });
    }

    for (const handle of [...new Set(OPPORTUNITY_FIXTURE.map((post) => post.sourceHandle))]) {
      upsertSource({ handle, name: handle, enabled: true, maxPosts: 10, rightsStatus: "unknown", profile: {} }, NOW);
      saveSourceCategoryConfig({
        sourceHandle: handle, categoryId: category.id, monitoringTier: "A",
        discoveryWeight: 1, categoryReputation: null, enabled: true, lastEvidenceAt: 0,
      });
    }

    const seedPost = (post, text, at) => {
      const scored = scorePost({ ...post, now: NOW });
      upsertPost({
        externalId: post.externalId, sourceHandle: post.sourceHandle, authorHandle: post.authorHandle,
        statusUrl: "https://x.com/" + post.sourceHandle + "/status/" + post.externalId, text,
        createdTimestamp: post.createdTimestamp, likes: post.likes, replies: post.replies,
        reposts: post.reposts, quotes: post.quotes, views: post.views, followers: post.followers,
        mediaCount: post.mediaCount, mediaJson: "[]", rawJson: "{}", score: scored.score,
        scoreReason: scored.reason, sensitive: post.sensitive, clusterKey: post.clusterKey || post.externalId,
      }, at);
    };
    const PAD = ${options.padText ? "true" : "false"};
    for (const post of OPPORTUNITY_FIXTURE) seedPost(post, PAD ? post.text + " " + "dolgu metni ".repeat(80) : post.text, NOW);

    setSetting("jev_mode", ${JSON.stringify(options.mode)}, NOW);
    setSetting("jev_base_url", "https://api.typesafe.ai", NOW);
    ${options.cap ? `setSetting("jev_daily_batch_cap", ${JSON.stringify(options.cap)}, NOW);` : ""}
    ${options.callsToday ? `setSetting(dayKey(NOW), ${JSON.stringify(options.callsToday)}, NOW);` : ""}

    const RELEVANCE = ${JSON.stringify(options.relevance || {})};
    const calls = [];
    const DRIFT = ${JSON.stringify(options.drift || "")};
    setJevTransportForTests(async (request) => {
      calls.push(JSON.parse(request.body));
      if (DRIFT && calls.length === 1) {
        // The post is rewritten while the provider is "thinking".
        const moved = OPPORTUNITY_FIXTURE.find((post) => post.externalId === DRIFT);
        seedPost(moved, moved.text + " (guncellendi)", NOW + 60);
      }
      const body = JSON.parse(request.body);
      const answers = {};
      body.state.candidates.forEach((candidate, candidateIndex) => {
        body.state.facets.forEach((_facet, facetIndex) => {
          const accountIndex = calls.length - 1 === 0 ? facetIndex : 3 + facetIndex;
          const percent = (RELEVANCE[accountIndex] || {})[candidate.id];
          answers["f" + facetIndex + "_c" + candidateIndex] = { type: "score", score: percent === undefined ? 1 : (percent / 50) };
        });
      });
      return { status: ${options.status || 200}, text: ${options.body || 'JSON.stringify({ answers, model: "jev-1.13.0" })'} };
    });

    const before = selectDiverseCandidates(candidates(24, NOW), 6).map((post) => post.externalId);
    const accounts = getAccounts().filter((account) => account.enabled);
    const result = await rankOpportunityBatch({
      posts: candidates(32, NOW), accounts, categories: getCategories(),
      accountConfigurations: getAccountCategoryConfigs(),
      sourceDomains: () => [category.slug],
      localScore: (post) => opportunityScoreForPost(post, NOW),
      now: NOW,
    });
    const after = selectDiverseCandidates(candidates(24, NOW), 6).map((post) => post.externalId);
    const db = new Database(process.env.ISPATLA_DB, { strict: true });
    console.log(JSON.stringify({
      calls: calls.length,
      facetCounts: calls.map((call) => call.state.facets.length),
      candidateCounts: calls.map((call) => call.state.candidates.length),
      bodySizes: calls.map((call) => JSON.stringify(call).length),
      candidateCount: calls[0] ? calls[0].state.candidates.length : 0,
      firstCandidate: calls[0] ? calls[0].state.candidates[0] : null,
      result,
      before,
      after,
      accountIds: accounts.map((account) => account.id),
      posts: db.query("SELECT external_id, relevance_score, relevance_source, relevance_json, relevance_at FROM observed_posts WHERE relevance_score IS NOT NULL ORDER BY external_id").all(),
      decisions: db.query("SELECT post_external_id, reason_code, details_json FROM decision_records WHERE reason_code='jev_rank'").all(),
      ledger: db.query("SELECT COUNT(*) AS count FROM jev_scores WHERE subject_kind='post'").get(),
      callsToday: db.query("SELECT value FROM app_settings WHERE name=?").get(dayKey(NOW)),
    }));
  `;
}

test("jev_mode off makes no transport call and leaves the legacy ordering untouched", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({ mode: "off", accounts: 2, relevance: { 0: { f13: 100 } } })));
  expect(output.calls).toBe(0);
  expect(output.result).toMatchObject({ mode: "off", degraded: true, diagnostics: ["disabled"], calls: 0 });
  expect(output.posts).toEqual([]);
  expect(output.decisions).toEqual([]);
  // The fixture's recorded before-state (jev-context/olcum/oncesi-fixture.json).
  expect(output.before).toEqual(["f01", "f04", "f14", "f15", "f09", "f16"]);
  expect(output.after).toEqual(output.before);
});

test("shadow persists relevance, writes a jev_rank decision row and changes no publish order", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({
    mode: "shadow",
    accounts: 2,
    relevance: { 0: { f01: 0, f04: 100, f14: 0, f15: 100 }, 1: { f01: 50, f04: 0, f14: 20, f15: 0 } },
  })));
  expect(output.calls).toBe(1);
  expect(output.facetCounts).toEqual([2]);
  expect(output.candidateCount).toBeLessThanOrEqual(32);
  expect(output.firstCandidate).toMatchObject({ scope: expect.any(String), domains: expect.any(Array) });
  expect(output.result.degraded).toBe(false);
  expect(output.posts.length).toBe(output.candidateCount);
  const f01 = output.posts.find((post: { external_id: string }) => post.external_id === "f01");
  expect(f01.relevance_score).toBe(50);
  expect(f01.relevance_source).toBe("jev");
  expect(f01.relevance_at).toBe(FIXTURE_NOW);
  expect(JSON.parse(f01.relevance_json).perAccount).toEqual({ [output.accountIds[0]]: 0, [output.accountIds[1]]: 50 });
  expect(output.decisions).toHaveLength(1);
  const details = JSON.parse(output.decisions[0].details_json);
  expect(details.mode).toBe("shadow");
  expect(details.localOrder[0]).toBe("f01");
  expect(details.jevOrder[0]).toBe("f04");
  expect(details.perAccount).toBeDefined();
  expect(output.ledger.count).toBe(output.candidateCount * 2);
  // shadow writes the ledger but never moves a decision.
  expect(output.after).toEqual(output.before);
});

test("on reorders the publish loop by relevance", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({
    mode: "on",
    accounts: 1,
    relevance: { 0: { f01: 0, f02: 100, f04: 100, f09: 0, f14: 0, f15: 100, f16: 0, f05: 100 } },
  })));
  expect(output.calls).toBe(1);
  expect(output.before).toEqual(["f01", "f04", "f14", "f15", "f09", "f16"]);
  expect(output.after).not.toEqual(output.before);
  expect(output.after[0]).not.toBe("f01");
  expect(output.after).toContain("f05");
});

test("a degraded 429 in on mode keeps the legacy order and never throws", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({
    mode: "on",
    accounts: 2,
    status: 429,
    body: '""',
    relevance: { 0: { f01: 0, f04: 100 } },
  })));
  expect(output.calls).toBe(1);
  expect(output.result.degraded).toBe(true);
  expect(output.result.diagnostics).toEqual(["http_rate_limited"]);
  expect(output.posts).toEqual([]);
  expect(output.after).toEqual(output.before);
});

test("a post rewritten during the call is dropped and reported, the rest are kept", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({
    mode: "shadow",
    accounts: 2,
    drift: "f01",
    relevance: { 0: { f01: 100, f04: 100 }, 1: { f01: 100, f04: 0 } },
  })));
  expect(output.calls).toBe(1);
  expect(output.result.degraded).toBe(false);
  expect(output.result.diagnostics).toEqual(["source_changed_during_evaluation"]);
  expect(output.result.changedDuringEvaluation).toEqual(["f01"]);
  // The drifted post carries no relevance at all; every other candidate still does.
  expect(output.result.relevance.f01).toBeUndefined();
  expect(output.result.relevance.f04).toBe(100);
  const stored = output.posts.map((post: { external_id: string }) => post.external_id);
  expect(stored).not.toContain("f01");
  expect(stored).toContain("f04");
  expect(output.ledger.count).toBe((output.candidateCount - 1) * 2);
  const details = JSON.parse(output.decisions[0].details_json);
  expect(details.changedDuringEvaluation).toEqual(["f01"]);
  expect(details.diagnostics).toEqual(["source_changed_during_evaluation"]);
});

test("five accounts are covered by two calls of at most three facets", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({ mode: "shadow", accounts: 5 })));
  expect(output.calls).toBe(2);
  expect(output.facetCounts).toEqual([3, 2]);
  expect(output.result.calls).toBe(2);
  expect(output.callsToday.value).toBe("2");
});

test("a padded pool is covered by planned calls that stay inside the budget", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({ mode: "shadow", accounts: 3, padText: true })));
  // Three accounts are one facet group, so every extra call is a candidate chunk.
  expect(output.facetCounts).toEqual(Array.from({ length: output.calls }, () => 3));
  expect(output.candidateCounts.reduce((sum: number, count: number) => sum + count, 0)).toBe(output.result.postIds.length);
  for (const size of output.bodySizes) expect(size).toBeLessThanOrEqual(24_000);
  expect(output.result.calls).toBe(output.calls);
  expect(output.callsToday.value).toBe(String(output.calls));
  expect(output.result.degraded).toBe(false);
  expect(output.result.diagnostics).toEqual([]);
  // Every candidate is still scored exactly once per account.
  expect(output.ledger.count).toBe(output.result.postIds.length * 3);
  expect(output.posts.length).toBe(output.result.postIds.length);
});

test("every planned body stays inside the 24000 char request budget", () => {
  const facets = Array.from({ length: 3 }, (_, index) =>
    accountFacet(
      { id: index + 1, handle: `hesap${index}`, styleProfile: { niche: "uzun bir yayın alanı tarifi ".repeat(6) } } as unknown as Account,
      [{ id: 1, slug: "news", name: "Haber", enabled: true, description: "Uzun kategori tarifi ".repeat(10), keywords: ["a", "b", "c"] }] as unknown as CategoryDefinition[],
      [{ accountId: index + 1, categoryId: 1, categorySlug: "news", enabled: true }] as unknown as AccountCategoryConfig[],
    ),
  );
  const pool = Array.from({ length: 32 }, (_, index) =>
    toJevCandidate(
      { externalId: `post-${index}`, sourceHandle: "kaynakhesap", text: `Başlık ${index} ${"g".repeat(200)}\n${"gövde ".repeat(200)}` },
      ["news", "politics", "technology", "finance", "culture", "sports"],
    ),
  );
  const perCall = jevPlanCandidateChunks({
    candidateCount: pool.length,
    facets,
    statementChars: 400,
    fixedChars: jevFixedChars(JEV_BATCH_QUERY, "jev-latest"),
    titleChars: Math.max(...pool.map((item) => JSON.stringify(item.title).length)),
    scopeChars: Math.max(...pool.map((item) => JSON.stringify(item.scope).length)),
    domainsChars: Math.max(...pool.map((item) => JSON.stringify(item.domains).length)),
  });
  expect(perCall).toBeGreaterThan(0);
  expect(perCall).toBeLessThan(pool.length);
  const config = { ...jevConfig(), model: "jev-latest" };
  for (let offset = 0; offset < pool.length; offset += perCall) {
    const body = JSON.stringify(buildJevRequestBody(config, JEV_BATCH_QUERY, facets, pool.slice(offset, offset + perCall)));
    expect(body.length).toBeLessThanOrEqual(JEV_MAX_INPUT_CHARS);
  }
});

test("the daily cap stops the batch before any transport call", () => {
  const output = JSON.parse(runIsolatedDatabase(batchScript({
    mode: "shadow", accounts: 2, cap: "3", callsToday: "3", relevance: { 0: { f01: 100 } },
  })));
  expect(output.calls).toBe(0);
  expect(output.result.capped).toBe(true);
  expect(output.result.diagnostics).toEqual(["budget_exceeded"]);
  expect(output.posts).toEqual([]);
  const details = JSON.parse(output.decisions[0].details_json);
  expect(details.diagnostics).toEqual(["budget_exceeded"]);
  expect(details.capped).toBe(true);
  expect(output.after).toEqual(output.before);
});

test("dayKey is a UTC calendar day inside the app_settings namespace", () => {
  expect(dayKey(FIXTURE_NOW)).toBe("jev_batch:2025-06-15");
});

test("a candidate carries the first line, a truncated statement, the source and its categories", () => {
  const candidate = toJevCandidate(
    { externalId: "f01", sourceHandle: "haberturk", text: `Başlık satırı\nGövde ${"x".repeat(600)}` },
    ["gundem", "ekonomi"],
  );
  expect(candidate).toMatchObject({ id: "f01", title: "Başlık satırı", scope: "haberturk", domains: ["gundem", "ekonomi"] });
  expect(candidate.statement.length).toBe(400);
});

test("an account facet carries its category definitions and its style niche", () => {
  const account = { id: 7, handle: "ekonomi", styleProfile: { niche: "makro ekonomi" } } as unknown as Account;
  const categories = [
    { id: 1, slug: "finance", name: "Finans", enabled: true, description: "Piyasa haberleri", keywords: ["faiz", "kur"] },
    { id: 2, slug: "sports", name: "Spor", enabled: true, description: "Maç", keywords: [] },
  ] as unknown as CategoryDefinition[];
  const configurations = [{ accountId: 7, categoryId: 1, categorySlug: "finance", enabled: true }] as unknown as AccountCategoryConfig[];
  const facet = accountFacet(account, categories, configurations);
  expect(facet).toContain("@ekonomi");
  expect(facet).toContain("Finans");
  expect(facet).toContain("makro ekonomi");
  expect(facet).not.toContain("Spor");
});

test("relevance only breaks a tie inside the already eligible accounts", () => {
  const accounts = [{ id: 1 }, { id: 2 }, { id: 3 }] as unknown as Account[];
  const post = (perAccount: Record<number, number>) => ({ relevanceJson: JSON.stringify({ perAccount }) });
  expect(preferredRelevanceAccount(accounts, post({ 1: 10, 2: 90, 3: 40 }))?.id).toBe(2);
  // An account outside the eligible set never wins.
  expect(preferredRelevanceAccount([accounts[0], accounts[2]], post({ 1: 10, 2: 90, 3: 40 }))?.id).toBe(3);
  // No evidence, and ties, fall back to the legacy selector.
  expect(preferredRelevanceAccount(accounts, post({}))).toBeUndefined();
  expect(preferredRelevanceAccount(accounts, { relevanceJson: null })).toBeUndefined();
  expect(preferredRelevanceAccount(accounts, post({ 1: 90, 2: 90 }))).toBeUndefined();
});
