import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CategoryDefinition } from "@/server/db";
import {
  buildSourceJevCandidate,
  categoryFacetText,
  jevFacetChunks,
  sourceJevProfileFields,
  sourceRelevanceChoice,
  sourceStatementBudget,
  type SourceJevEvidence,
} from "@/server/pipeline";

/** The Jev source pass is exercised against a throwaway database in a child process. */
function runIsolatedDatabase(script: string): Record<string, unknown> {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-source-jev-"));
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
    const output = new TextDecoder().decode(result.stdout).trim().split("\n").at(-1) || "{}";
    return JSON.parse(output) as Record<string, unknown>;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * One scoreSources run with a fake FxTwitter profile, a fake OpenAI response
 * and an injected Jev transport. Nothing here reaches the network.
 */
function scanScript(options: { mode: string; jevStatus?: number; jevScore?: number }): string {
  return `
    process.env.OPENAI_API_KEY = "test-only-key";
    process.env.JEV_API_KEY = "jev-test-only-key";
    const db = await import("./src/server/db.ts");
    const jev = await import("./src/server/jev.ts");
    const pipeline = await import("./src/server/pipeline.ts");
    if (!db.ensureDatabase()) throw new Error("database did not initialize");
    const now = 2000000;
    db.setSetting("jev_mode", ${JSON.stringify(options.mode)}, now);
    db.setSetting("jev_base_url", "https://api.typesafe.ai", now);
    db.setSetting("jev_cache_ttl_seconds", "0", now);
    db.upsertSource({
      handle: "kaynak",
      name: "Kaynak",
      enabled: true,
      maxPosts: 20,
      rightsStatus: "unknown",
      profile: { origin: "manual", status: "active", niche: "haber", topics: ["gündem"], tone: "doğrudan" },
    }, now);

    let jevCalls = 0;
    jev.setJevTransportForTests(async (request) => {
      jevCalls += 1;
      if (${Number(options.jevStatus ?? 200)} !== 200) return { status: ${Number(options.jevStatus ?? 200)}, text: "{}" };
      const body = JSON.parse(request.body);
      const answers = {};
      for (const key of Object.keys(body.questions)) answers[key] = { type: "score", score: ${Number(options.jevScore ?? 1)} };
      return { status: 200, text: JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 2 } }) };
    });

    let aiCalls = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("fxtwitter.com")) {
        return new Response(JSON.stringify({ user: { screen_name: "kaynak", name: "Kaynak", description: "Ekonomi ve gündem haberleri", followers: 1000 } }));
      }
      aiCalls += 1;
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        score: 80, risk: 10, confidence: 90, reason: "Kaynaklı ve güncel.",
        niche: "haber", topics: ["gündem"], tone: "doğrudan",
        ideology: "belirsiz", ideologyTags: [], ideologyConfidence: 0,
        ideologyBasis: "insufficient_evidence", ideologyReason: "Yeterli açık siyasi çizgi yok.",
      }) }));
    };

    const errors = [];
    const samples = new Map([["kaynak", [{
      id: "1", url: "https://x.com/kaynak/status/1", text: "Enflasyon verisi açıklandı.",
      createdAt: now - 3600, author: {}, metrics: {}, media: [], sensitive: false,
      discovery: { quoteAuthor: "", replyTo: "", mentions: [] },
    }]]]);
    const result = await pipeline.scoreSources(now, samples, errors);
    const stored = db.getStoredSources().find((item) => item.handle === "kaynak");
    const ledger = db.latestJevScoresFor("source", ["kaynak"]).get("kaynak") || [];
    console.log(JSON.stringify({
      result,
      profile: stored ? stored.profile : null,
      errors,
      jevCalls,
      aiCalls,
      ledgerRows: ledger.length,
      ledgerKeys: ledger.map((row) => row.questionKey).sort(),
      enabledCategories: db.getCategories().filter((item) => item.enabled).length,
    }));
  `;
}

function category(slug: string, name: string): CategoryDefinition {
  return {
    id: 1, slug, name, enabled: true, builtIn: true,
    baseStrategy: "news", clusterStrategy: "event", verificationMode: "strict",
    description: "Hızlı, kaynaklı haber özeti.",
    positiveExamples: ["Deprem sonrası resmî açıklama", "Merkez bankası faiz kararı"],
    negativeExamples: [], keywords: ["haber", "gündem", "açıklama"], excludedKeywords: [],
    seedHandles: [], defaultFormats: [], sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {},
    publishingPolicy: {}, aiContext: "", createdAt: 0, updatedAt: 0,
  } as unknown as CategoryDefinition;
}

const evidence: SourceJevEvidence = {
  handle: "kaynak",
  name: "Kaynak Haber",
  bio: "Bağımsız   ekonomi haberleri",
  niche: "haber",
  topics: ["gündem", "ekonomi"],
  tone: "doğrudan",
  recentPosts: Array.from({ length: 9 }, (_, index) => `Gönderi metni ${index}`),
};

describe("jev source candidate and facet helpers", () => {
  test("builds one candidate per source with a bounded statement", () => {
    const candidate = buildSourceJevCandidate(evidence, 400);
    expect(candidate.id).toBe("kaynak");
    expect(candidate.scope).toBe("kaynak");
    expect(candidate.title).toBe("Kaynak Haber");
    expect(candidate.domains).toEqual(["haber", "gündem", "ekonomi"]);
    expect(candidate.statement).toContain("Bağımsız ekonomi haberleri");
    expect(candidate.statement).toContain("Konular: gündem, ekonomi");
    expect(candidate.statement.split("Gönderi: ").length - 1).toBe(6);
    expect(buildSourceJevCandidate(evidence, 10).statement.length).toBeLessThanOrEqual(320);
  });

  test("splits the batch statement budget and keeps a floor", () => {
    expect(sourceStatementBudget(10)).toBe(1400);
    expect(sourceStatementBudget(100)).toBe(320);
    expect(sourceStatementBudget(0)).toBe(14_000);
  });

  test("keeps facet text short and free of provider instructions", () => {
    const text = categoryFacetText(category("news", "News"));
    expect(text.startsWith("News — Hızlı, kaynaklı haber özeti.")).toBe(true);
    expect(text).toContain("Anahtar: haber, gündem, açıklama");
    expect(text.length).toBeLessThanOrEqual(420);
  });

  test("chunks categories to at most three facets and respects the question budget", () => {
    const categories = Array.from({ length: 11 }, (_, index) => category(`c${index}`, `C${index}`));
    expect(jevFacetChunks(categories, 10).map((chunk) => chunk.length)).toEqual([3, 3, 3, 2]);
    expect(jevFacetChunks(categories, 32).map((chunk) => chunk.length)).toEqual([3, 3, 3, 2]);
    expect(jevFacetChunks(categories, 50).map((chunk) => chunk.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(jevFacetChunks(categories, 0).map((chunk) => chunk.length)).toEqual([3, 3, 3, 2]);
  });

  test("only mode on with a usable score replaces the OpenAI relevance", () => {
    const usable = { relevance: 50, categoryScores: { news: 50 }, diagnostics: [], degraded: false };
    const failed = { relevance: null, categoryScores: {}, diagnostics: ["http_rate_limited"], degraded: true };
    expect(sourceRelevanceChoice("on", usable)).toEqual({ relevance: 50, relevanceSource: "jev" });
    expect(sourceRelevanceChoice("on", failed)).toEqual({ relevance: null, relevanceSource: "openai_fallback" });
    expect(sourceRelevanceChoice("on", undefined)).toEqual({ relevance: null, relevanceSource: "openai_fallback" });
    expect(sourceRelevanceChoice("shadow", usable)).toEqual({ relevance: null, relevanceSource: "openai" });
    expect(sourceRelevanceChoice("off", usable)).toEqual({ relevance: null, relevanceSource: "openai" });
  });

  test("writes no profile keys when Jev is off and only additive keys otherwise", () => {
    const usable = { relevance: 50, categoryScores: { news: 50 }, diagnostics: [], degraded: false };
    expect(sourceJevProfileFields("off", usable)).toEqual({});
    expect(sourceJevProfileFields("shadow", usable)).toEqual({
      sourceRelevanceSource: "openai", jevRelevance: 50, jevCategoryScores: { news: 50 },
    });
    expect(sourceJevProfileFields("on", { relevance: null, categoryScores: {}, diagnostics: ["http_rate_limited"], degraded: true })).toEqual({
      sourceRelevanceSource: "openai_fallback", jevDiagnostics: ["http_rate_limited"],
    });
  });
});

describe("source scoring with Jev", () => {
  test("mode off never calls Jev and keeps the OpenAI score", () => {
    const output = runIsolatedDatabase(scanScript({ mode: "off" }));
    const profile = output.profile as Record<string, unknown>;
    expect(output.jevCalls).toBe(0);
    expect(output.ledgerRows).toBe(0);
    expect(output.result).toMatchObject({ scored: 1, deleted: 0 });
    expect(profile.sourceScore).toBe(84);
    expect(profile.sourceRelevanceSource).toBeUndefined();
    expect(profile.jevRelevance).toBeUndefined();
    expect(output.errors).toEqual([]);
  });

  test("mode shadow records the ledger but leaves scoring on OpenAI", () => {
    const output = runIsolatedDatabase(scanScript({ mode: "shadow" }));
    const profile = output.profile as Record<string, unknown>;
    expect(Number(output.jevCalls)).toBeGreaterThan(0);
    expect(output.ledgerRows).toBe(output.enabledCategories);
    expect((output.ledgerKeys as string[])).toContain("news");
    expect(profile.sourceScore).toBe(84);
    expect(profile.sourceRelevanceSource).toBe("openai");
    expect(profile.jevRelevance).toBe(50);
    expect((profile.jevCategoryScores as Record<string, number>).news).toBe(50);
    expect(output.errors).toEqual([]);
  });

  test("mode on replaces the OpenAI relevance with the Jev percent", () => {
    const output = runIsolatedDatabase(scanScript({ mode: "on" }));
    const profile = output.profile as Record<string, unknown>;
    expect(profile.sourceRelevanceSource).toBe("jev");
    expect(profile.jevRelevance).toBe(50);
    expect(profile.sourceScore).toBe(60);
    expect(output.errors).toEqual([]);
  });

  test("mode on with a rate limited Jev falls back to OpenAI with one scan note", () => {
    const output = runIsolatedDatabase(scanScript({ mode: "on", jevStatus: 429 }));
    const profile = output.profile as Record<string, unknown>;
    expect(profile.sourceRelevanceSource).toBe("openai_fallback");
    expect(profile.sourceScore).toBe(84);
    expect(profile.jevRelevance).toBeUndefined();
    expect(profile.jevDiagnostics).toEqual(["http_rate_limited"]);
    expect(output.errors).toEqual(["jev kaynak ilgililiği kullanılamadı: http_rate_limited"]);
  });

  test("chunks more than three categories into separate Jev calls", () => {
    const output = runIsolatedDatabase(scanScript({ mode: "on", jevScore: 2 }));
    const categories = Number(output.enabledCategories);
    expect(categories).toBeGreaterThan(3);
    expect(output.jevCalls).toBe(Math.ceil(categories / 3));
    expect((output.profile as Record<string, unknown>).jevRelevance).toBe(100);
  });
});
