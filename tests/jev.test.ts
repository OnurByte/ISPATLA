import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSetting, setSetting } from "@/server/db";
import {
  buildJevRequestBody,
  defaultCacheTtlSeconds,
  getJevSettings,
  isAliasModel,
  jevConfig,
  jevEndpoint,
  jevFixedChars,
  jevPlanCandidateChunks,
  jevQuestionOverheadChars,
  jevScore,
  jevToPercent,
  setJevTransportForTests,
  JEV_MAX_CANDIDATES,
  JEV_MAX_INPUT_CHARS,
  JEV_MAX_QUESTIONS,
  type JevCandidate,
  type JevTransport,
} from "@/server/jev";
import { isAllowedJevEndpoint } from "@/server/security";

const SETTING_NAMES = [
  "jev_mode",
  "jev_model",
  "jev_provider",
  "jev_base_url",
  "jev_timeout_ms",
  "jev_cache_ttl_seconds",
] as const;

const SYNTHETIC_KEY = "jev-synthetic-test-key";

function runIsolatedDatabase(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-jev-"));
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

function withJevSettings(settings: Record<string, string>, run: () => Promise<void> | void): Promise<void> | void {
  const now = Math.floor(Date.now() / 1000);
  const previous = Object.fromEntries(SETTING_NAMES.map((name) => [name, getSetting(name, "")]));
  const previousKey = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = SYNTHETIC_KEY;
  for (const [name, value] of Object.entries(settings)) setSetting(name, value, now);
  const restore = () => {
    for (const name of SETTING_NAMES) setSetting(name, previous[name] || "", Math.floor(Date.now() / 1000));
    if (previousKey === undefined) delete process.env.JEV_API_KEY;
    else process.env.JEV_API_KEY = previousKey;
  };
  let outcome: Promise<void> | void;
  try {
    outcome = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (outcome instanceof Promise) return outcome.finally(restore);
  restore();
  return undefined;
}

function candidate(index: number, salt = ""): JevCandidate {
  return {
    id: `c${index}${salt}`,
    title: `Başlık ${index}`,
    statement: `Aday ${index} metni`,
    scope: "haberci",
    domains: ["gundem"],
  };
}

function answersFor(facets: number, candidates: number, score = 2): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (let facet = 0; facet < facets; facet += 1) {
    for (let item = 0; item < candidates; item += 1) {
      answers[`f${facet}_c${item}`] = { type: "score", score };
    }
  }
  return answers;
}

function fakeTransport(text: string, status = 200): { transport: JevTransport; calls: Array<{ url: string; body: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  const transport: JevTransport = async (request) => {
    calls.push(request);
    return { status, text };
  };
  return { transport, calls };
}

/** Unique per run so the shared SQLite cache never leaks between test runs. */
function uniqueQuery(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

afterEach(() => {
  setJevTransportForTests(null);
});

describe("jev endpoint allowlist", () => {
  test("requires https, rejects credentials, query and fragment, allows loopback http", () => {
    expect(isAllowedJevEndpoint("https://api.typesafe.ai/v1/systemone")).toBe(true);
    expect(isAllowedJevEndpoint("http://api.typesafe.ai/v1/systemone")).toBe(false);
    expect(isAllowedJevEndpoint("https://user:pass@api.typesafe.ai/v1/systemone")).toBe(false);
    expect(isAllowedJevEndpoint("https://api.typesafe.ai/v1/systemone?key=1")).toBe(false);
    expect(isAllowedJevEndpoint("https://api.typesafe.ai/v1/systemone#frag")).toBe(false);
    expect(isAllowedJevEndpoint("http://localhost:8080/v1/systemone")).toBe(true);
    expect(isAllowedJevEndpoint("http://127.0.0.1:8080/v1/systemone")).toBe(true);
    expect(isAllowedJevEndpoint("http://[::1]:8080/v1/systemone")).toBe(true);
    expect(isAllowedJevEndpoint("ftp://api.typesafe.ai/v1/systemone")).toBe(false);
    expect(isAllowedJevEndpoint("not a url")).toBe(false);
  });

  test("appends the systemone path once", () => {
    expect(jevEndpoint("https://api.typesafe.ai")).toBe("https://api.typesafe.ai/v1/systemone");
    expect(jevEndpoint("https://api.typesafe.ai/")).toBe("https://api.typesafe.ai/v1/systemone");
    expect(jevEndpoint("https://api.typesafe.ai/v1")).toBe("https://api.typesafe.ai/v1/systemone");
  });

  test("maps 0-2 scores onto the 0-100 scale", () => {
    expect([jevToPercent(0), jevToPercent(1), jevToPercent(1.5), jevToPercent(2), jevToPercent(9), jevToPercent(Number.NaN)])
      .toEqual([0, 50, 75, 100, 100, 0]);
  });
});

describe("jev scoring client", () => {
  test("off mode short circuits before key, network and cache", async () => {
    const { transport, calls } = fakeTransport(JSON.stringify({ answers: answersFor(1, 1) }));
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "off" }, async () => {
      const result = await jevScore({ query: uniqueQuery("off"), facets: ["gündem"], candidates: [candidate(0)] });
      expect(result).toMatchObject({ mode: "off", degraded: false, cacheHit: false, requestHash: "" });
      expect(result.diagnostics).toEqual(["disabled"]);
      expect(result.scores).toEqual({});
      expect(calls).toHaveLength(0);
    });
  });

  test("builds the contract request: url, bearer header, question cross product and 3 criteria", async () => {
    const { transport, calls } = fakeTransport(JSON.stringify({ answers: answersFor(2, 3), model: "typesafe-ai/jev", usage: { input_tokens: 900, output_tokens: 40 } }));
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "shadow", jev_base_url: "https://api.typesafe.ai", jev_model: "jev-1.13.0" }, async () => {
      const result = await jevScore({
        query: uniqueQuery("shape"),
        facets: ["kategori a", "kategori b"],
        candidates: [candidate(0), candidate(1), candidate(2)],
        scope: "source_scan",
      });
      expect(result.degraded).toBe(false);
      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call.url).toBe("https://api.typesafe.ai/v1/systemone");
      expect(call.headers.authorization).toBe(`Bearer ${SYNTHETIC_KEY}`);
      expect(call.headers["content-type"]).toBe("application/json");
      const body = JSON.parse(call.body);
      expect(body.model).toBe("jev-1.13.0");
      expect(body.state.facets).toEqual(["kategori a", "kategori b"]);
      expect(body.state.candidates[0]).toEqual({ id: "c0", title: "Başlık 0", statement: "Aday 0 metni", scope: "haberci", domains: ["gundem"] });
      expect(Object.keys(body.questions).sort()).toEqual(["f0_c0", "f0_c1", "f0_c2", "f1_c0", "f1_c1", "f1_c2"]);
      for (const question of Object.values(body.questions) as Array<{ type: string; instructions: string; criteria: string[] }>) {
        expect(question.type).toBe("score");
        expect(question.criteria).toHaveLength(3);
        expect(question.instructions.length).toBeGreaterThan(20);
      }
      expect(result.usage).toEqual({ input_tokens: 900, output_tokens: 40 });
      expect(result.reportedModel).toBe("typesafe-ai/jev");
    });
  });

  test("refuses over-budget batches before any transport call", async () => {
    const { transport, calls } = fakeTransport(JSON.stringify({ answers: {} }));
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "on" }, async () => {
      const many = Array.from({ length: 33 }, (_, index) => candidate(index));
      const tooManyCandidates = await jevScore({ query: uniqueQuery("budget"), facets: ["a"], candidates: many });
      const tooManyFacets = await jevScore({ query: uniqueQuery("budget"), facets: ["a", "b", "c", "d"], candidates: [candidate(0)] });
      const tooLarge = await jevScore({
        query: uniqueQuery("budget"),
        facets: ["a"],
        candidates: [{ ...candidate(0), statement: "x".repeat(25_000) }],
      });
      for (const result of [tooManyCandidates, tooManyFacets, tooLarge]) {
        expect(result.degraded).toBe(true);
        expect(result.diagnostics).toEqual(["budget_exceeded"]);
        expect(result.scores).toEqual({});
      }
      expect(calls).toHaveLength(0);
    });
  });

  test("parses facet scores, aggregates per candidate and serves the second identical call from cache", async () => {
    const answers = answersFor(2, 2);
    answers.f0_c0 = { type: "score", score: 2, probabilities: [0, 0, 1] };
    answers.f1_c0 = { type: "score", score: 0 };
    answers.f0_c1 = { type: "score", score: 1 };
    answers.f1_c1 = { type: "score", score: 1 };
    const { transport, calls } = fakeTransport(JSON.stringify({ answers, model: "typesafe-ai/jev" }));
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "shadow", jev_cache_ttl_seconds: "300" }, async () => {
      const args = { query: uniqueQuery("cache"), facets: ["a", "b"], candidates: [candidate(0), candidate(1)] };
      const first = await jevScore(args);
      expect(first.degraded).toBe(false);
      expect(first.cacheHit).toBe(false);
      expect(first.facetScores).toEqual({ "0": { c0: 2, c1: 1 }, "1": { c0: 0, c1: 1 } });
      expect(first.scores).toEqual({ c0: 2, c1: 1 });
      expect(first.requestHash).toMatch(/^[0-9a-f]{64}$/);

      const second = await jevScore(args);
      expect(second.cacheHit).toBe(true);
      expect(second.degraded).toBe(false);
      expect(second.scores).toEqual({ c0: 2, c1: 1 });
      expect(second.facetScores).toEqual(first.facetScores);
      expect(second.requestHash).toBe(first.requestHash);
      expect(calls).toHaveLength(1);
    });
  });

  test("collapses concurrent identical requests into a single call", async () => {
    let calls = 0;
    setJevTransportForTests(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { status: 200, text: JSON.stringify({ answers: answersFor(1, 1, 1) }) };
    });
    await withJevSettings({ jev_mode: "shadow", jev_cache_ttl_seconds: "0" }, async () => {
      const args = { query: uniqueQuery("single-flight"), facets: ["a"], candidates: [candidate(0)] };
      const results = await Promise.all(Array.from({ length: 6 }, () => jevScore(args)));
      expect(calls).toBe(1);
      expect(results.every((result) => !result.degraded && result.scores.c0 === 1)).toBe(true);
    });
  });

  test("rejects answers that break the contract", async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["key mismatch", { answers: { f0_c9: { type: "score", score: 1 } } }],
      ["score out of range", { answers: { f0_c0: { type: "score", score: 2.5 } } }],
      ["probability sum", { answers: { f0_c0: { type: "score", score: 1, probabilities: [0.1, 0.4, 0.4] } } }],
      ["wrong type", { answers: { f0_c0: { type: "choice", score: 1 } } }],
      ["broken payload", { answers: [] }],
    ];
    for (const [label, payload] of cases) {
      const { transport } = fakeTransport(JSON.stringify(payload));
      setJevTransportForTests(transport);
      await withJevSettings({ jev_mode: "shadow" }, async () => {
        const result = await jevScore({ query: uniqueQuery(`invalid-${label}`), facets: ["a"], candidates: [candidate(0)] });
        expect(result.diagnostics, label).toEqual(["answers_invalid"]);
        expect(result.degraded, label).toBe(true);
        expect(result.scores, label).toEqual({});
      });
    }
  });

  test("accepts two-decimal quantized probabilities only for the vercel provider", async () => {
    const payload = JSON.stringify({
      answers: { f0_c0: { type: "score", score: 1.61, probabilities: [0.05, 0.3, 0.66] } },
    });
    for (const [provider, expected] of [["typesafe", true], ["vercel", false]] as const) {
      const { transport } = fakeTransport(payload);
      setJevTransportForTests(transport);
      await withJevSettings({ jev_mode: "shadow", jev_provider: provider, jev_cache_ttl_seconds: "0" }, async () => {
        const result = await jevScore({ query: uniqueQuery(`quantized-${provider}`), facets: ["a"], candidates: [candidate(0)] });
        expect(result.degraded, provider).toBe(expected);
        if (expected) expect(result.diagnostics).toEqual(["answers_invalid"]);
        else expect(result.scores).toEqual({ c0: 1.61 });
      });
    }
  });

  test("accepts the live gateway shape: object-keyed probabilities with legend/confidence extras", async () => {
    // Exact shape observed from the local gateway on 2026-09-22 (score 0.37 vs expectation 0.36 → vercel slack).
    const payload = JSON.stringify({
      answers: { f0_c0: { type: "score", score: 0.37, probabilities: { "0": 0.77, "1": 0.1, "2": 0.13 }, legend: { "0": "none", "1": "partial", "2": "direct" }, confidence: 0.77, confidence_source: "adapter_max_probability" } },
      model: "typesafe-ai/jev",
      usage: { input_tokens: 333, output_tokens: 20 },
      latency_ms: 583,
    });
    const { transport } = fakeTransport(payload);
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "on", jev_provider: "vercel", jev_cache_ttl_seconds: "0" }, async () => {
      const result = await jevScore({ query: uniqueQuery("gateway-shape"), facets: ["a"], candidates: [candidate(0)] });
      expect(result.degraded).toBe(false);
      expect(result.scores).toEqual({ c0: 0.37 });
      expect(result.reportedModel).toBe("typesafe-ai/jev");
      expect(result.usage).toEqual({ input_tokens: 333, output_tokens: 20 });
    });
  });

  test("maps transport failures onto fixed diagnostics without leaking provider text", async () => {
    const secret = "rate limit for account acct_4711 at https://api.typesafe.ai";
    const { transport } = fakeTransport(secret, 429);
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "on" }, async () => {
      const result = await jevScore({ query: uniqueQuery("429"), facets: ["a"], candidates: [candidate(0)] });
      expect(result.diagnostics).toEqual(["http_rate_limited"]);
      expect(result.degraded).toBe(true);
      expect(result.mode).toBe("on");
      expect(JSON.stringify(result)).not.toContain("acct_4711");
    });

    for (const [status, code] of [[401, "http_unauthorized"], [403, "http_forbidden"], [503, "http_server_error"], [418, "http_error"]] as const) {
      const failing = fakeTransport("nope", status);
      setJevTransportForTests(failing.transport);
      await withJevSettings({ jev_mode: "shadow" }, async () => {
        const result = await jevScore({ query: uniqueQuery(`status-${status}`), facets: ["a"], candidates: [candidate(0)] });
        expect(result.diagnostics, String(status)).toEqual([code]);
      });
    }

    setJevTransportForTests(async () => {
      const error = new Error("The operation timed out.");
      error.name = "TimeoutError";
      throw error;
    });
    await withJevSettings({ jev_mode: "shadow", jev_timeout_ms: "500" }, async () => {
      const result = await jevScore({ query: uniqueQuery("timeout"), facets: ["a"], candidates: [candidate(0)] });
      expect(result.diagnostics).toEqual(["deadline_exceeded"]);
      expect(result.degraded).toBe(true);
      expect(result.scores).toEqual({});
    });
  });

  test("degrades when the endpoint is not allowlisted", async () => {
    const { transport, calls } = fakeTransport(JSON.stringify({ answers: answersFor(1, 1) }));
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "shadow", jev_base_url: "http://evil.example.com" }, async () => {
      const result = await jevScore({ query: uniqueQuery("endpoint"), facets: ["a"], candidates: [candidate(0)] });
      expect(result.diagnostics).toEqual(["endpoint_invalid"]);
      expect(calls).toHaveLength(0);
    });
  });
});

describe("jev persistence", () => {
  test("applies migration 16 and round trips the score ledger", () => {
    const output = runIsolatedDatabase(`
      import { ensureDatabase, latestJevScoresFor } from "./src/server/db.ts";
      import { recordJevScores } from "./src/server/jev.ts";
      if (!ensureDatabase()) throw new Error("database did not initialize");
      const result = {
        mode: "shadow", scores: { "post-1": 2, "post-2": 1 }, facetScores: { "0": { "post-1": 2, "post-2": 1 } },
        degraded: false, diagnostics: [], cacheHit: false, usage: { input_tokens: 120, output_tokens: 12 },
        latencyMs: 412, requestHash: "a".repeat(64), reportedModel: "typesafe-ai/jev",
      };
      const written = recordJevScores({
        subjectKind: "post",
        entries: [
          { subjectId: "post-1", questionKey: "f0_c0", score: 2 },
          { subjectId: "post-2", questionKey: "f0_c1", score: 1 },
        ],
        result,
        now: 1000,
      });
      const again = recordJevScores({
        subjectKind: "post",
        entries: [{ subjectId: "post-1", questionKey: "f0_c0", score: 2 }],
        result,
        now: 1001,
      });
      const read = latestJevScoresFor("post", ["post-1", "post-2", "missing"]);
      console.log(JSON.stringify({
        written, again,
        post1: read.get("post-1"), post2: read.get("post-2"), missing: read.get("missing") || null,
      }));
    `);
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({ written: 2, again: 1, missing: null });
    expect(parsed.post1).toEqual([{ questionKey: "f0_c0", score: 2, createdAt: 1001 }]);
    expect(parsed.post2).toEqual([{ questionKey: "f0_c1", score: 1, createdAt: 1000 }]);
  });

  test("records a usage event for every evaluation", () => {
    const output = runIsolatedDatabase(`
      import { ensureDatabase, getUsageSummary } from "./src/server/db.ts";
      import { recordJevScores } from "./src/server/jev.ts";
      if (!ensureDatabase()) throw new Error("database did not initialize");
      recordJevScores({
        subjectKind: "source",
        entries: [{ subjectId: "handle", questionKey: "f0_c0", score: 1.5 }],
        result: {
          mode: "shadow", scores: { handle: 1.5 }, facetScores: {}, degraded: false, diagnostics: [],
          cacheHit: false, usage: { input_tokens: 10, output_tokens: 2 }, latencyMs: 300,
          requestHash: "b".repeat(64), reportedModel: "typesafe-ai/jev",
        },
        now: 2000,
      });
      const summary = getUsageSummary(0);
      console.log(JSON.stringify({ byKind: summary.byKind, byProvider: summary.byProvider }));
    `);
    const parsed = JSON.parse(output);
    expect(parsed.byKind[0]).toMatchObject({ kind: "score:jev", events: 1, units: 1 });
    expect(parsed.byProvider[0]).toMatchObject({ provider: "jev", events: 1 });
  });
});

describe("cache ttl", () => {
  test("an alias model defaults to 300 seconds and a pinned version to 3600", () => {
    expect(isAliasModel("jev-latest")).toBe(true);
    expect(isAliasModel("JEV-LATEST")).toBe(true);
    // No version digit at all reads as a moving name too.
    expect(isAliasModel("jev")).toBe(true);
    expect(isAliasModel("")).toBe(true);
    expect(isAliasModel("jev-1.13.0")).toBe(false);
    expect(defaultCacheTtlSeconds("jev-latest")).toBe(300);
    expect(defaultCacheTtlSeconds("jev-1.13.0")).toBe(3600);
  });

  test("the resolved settings follow the model when no ttl is configured", () => {
    withJevSettings({ jev_mode: "shadow", jev_model: "jev-latest", jev_cache_ttl_seconds: "" }, () => {
      expect(getJevSettings().cacheTtlSeconds).toBe(300);
    });
    withJevSettings({ jev_mode: "shadow", jev_model: "jev-1.13.0", jev_cache_ttl_seconds: "" }, () => {
      expect(getJevSettings().cacheTtlSeconds).toBe(3600);
    });
  });

  test("an explicit jev_cache_ttl_seconds always wins over the model default", () => {
    for (const model of ["jev-latest", "jev-1.13.0"]) {
      withJevSettings({ jev_mode: "shadow", jev_model: model, jev_cache_ttl_seconds: "42" }, () => {
        expect(getJevSettings().cacheTtlSeconds, model).toBe(42);
      });
      withJevSettings({ jev_mode: "shadow", jev_model: model, jev_cache_ttl_seconds: "0" }, () => {
        expect(getJevSettings().cacheTtlSeconds, model).toBe(0);
      });
    }
  });
});

describe("confidence provenance", () => {
  test("counts answers that carry a confidence and never uses it for selection", async () => {
    const payload = JSON.stringify({
      answers: {
        f0_c0: { type: "score", score: 2, confidence: 0.91 },
        f0_c1: { type: "score", score: 1 },
      },
    });
    const { transport } = fakeTransport(payload);
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "shadow", jev_cache_ttl_seconds: "0" }, async () => {
      const result = await jevScore({
        query: uniqueQuery("confidence"),
        facets: ["a"],
        candidates: [candidate(0), candidate(1)],
      });
      expect(result.degraded).toBe(false);
      expect(result.confidenceProvenance).toEqual({ present: 1, missing: 1, usedForSelection: false });
      // The scores are exactly the reported ones: confidence changed nothing.
      expect(result.scores).toEqual({ c0: 2, c1: 1 });
    });
  });

  test("a degraded result still carries an empty provenance", async () => {
    const { transport } = fakeTransport("", 500);
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "on", jev_cache_ttl_seconds: "0" }, async () => {
      const result = await jevScore({ query: uniqueQuery("provenance-degraded"), facets: ["a"], candidates: [candidate(0)] });
      expect(result.degraded).toBe(true);
      expect(result.confidenceProvenance).toEqual({ present: 0, missing: 0, usedForSelection: false });
    });
  });
});

describe("jev request budget planning", () => {
  const facetText = (index: number) =>
    `f${index} — ${"kategori tanımı ve anahtar kelimeler ".repeat(10)}`.slice(0, 600);

  function planned(statementChars: number, facetCount: number, titleChars = 180) {
    const query = "Bu aday hesabın yayın alanına ne kadar doğrudan giriyor?";
    const model = "jev-latest";
    const facets = Array.from({ length: facetCount }, (_, index) => facetText(index));
    const perCall = jevPlanCandidateChunks({
      candidateCount: JEV_MAX_CANDIDATES,
      facets,
      statementChars,
      fixedChars: jevFixedChars(query, model),
      titleChars,
    });
    const candidates: JevCandidate[] = Array.from({ length: perCall }, (_, index) => ({
      id: `post-${index}-${"x".repeat(10)}`,
      title: "b".repeat(titleChars - 2),
      statement: "s".repeat(statementChars),
      scope: "kaynakhesap",
      domains: ["news", "politics", "technology", "finance", "culture", "sports"],
    }));
    const config = { ...jevConfig(), model };
    return { perCall, body: JSON.stringify(buildJevRequestBody(config, query, facets, candidates)) };
  }

  test("the questions block is measured from the real serializer", () => {
    expect(jevQuestionOverheadChars(0, 3)).toBe(2);
    expect(jevQuestionOverheadChars(1, 1)).toBeLessThan(340);
    // Monotonic in both axes, and 96 questions alone already blow the budget.
    expect(jevQuestionOverheadChars(10, 3)).toBeGreaterThan(jevQuestionOverheadChars(10, 2));
    expect(jevQuestionOverheadChars(32, 3)).toBeGreaterThan(JEV_MAX_INPUT_CHARS);
  });

  test("a planned body stays inside maxInputChars for every facet count", () => {
    for (const facetCount of [1, 2, 3]) {
      const { perCall, body } = planned(400, facetCount);
      expect(perCall).toBeGreaterThan(0);
      expect(perCall * facetCount).toBeLessThanOrEqual(JEV_MAX_QUESTIONS);
      expect(perCall).toBeLessThanOrEqual(JEV_MAX_CANDIDATES);
      expect(body.length).toBeLessThanOrEqual(JEV_MAX_INPUT_CHARS);
    }
  });

  test("a planned body stays inside maxInputChars for large statements", () => {
    const { perCall, body } = planned(1200, 3, 200);
    expect(perCall).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(JEV_MAX_INPUT_CHARS);
  });

  test("a planned call is accepted by jevScore instead of budget_exceeded", async () => {
    const { perCall } = planned(400, 3);
    const facets = [facetText(0), facetText(1), facetText(2)];
    const candidates = Array.from({ length: perCall }, (_, index) => ({
      ...candidate(index),
      statement: "s".repeat(400),
    }));
    const answers: Record<string, unknown> = {};
    for (let facetIndex = 0; facetIndex < facets.length; facetIndex += 1) {
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        answers[`f${facetIndex}_c${candidateIndex}`] = { type: "score", score: 1 };
      }
    }
    const { transport, calls } = fakeTransport(JSON.stringify({ answers }));
    setJevTransportForTests(transport);
    await withJevSettings({ jev_mode: "on", jev_cache_ttl_seconds: "0" }, async () => {
      const result = await jevScore({ query: uniqueQuery("planned"), facets, candidates });
      expect(result.diagnostics).toEqual([]);
      expect(result.degraded).toBe(false);
      expect(calls).toHaveLength(1);
      expect(calls[0].body.length).toBeLessThanOrEqual(JEV_MAX_INPUT_CHARS);
    });
  });

  test("planning refuses when a single candidate cannot fit", () => {
    expect(jevPlanCandidateChunks({ candidateCount: 8, facets: ["a"], statementChars: 30_000 })).toBe(0);
    expect(jevPlanCandidateChunks({ candidateCount: 8, facets: [], statementChars: 100 })).toBe(0);
    expect(jevPlanCandidateChunks({ candidateCount: 0, facets: ["a"], statementChars: 100 })).toBe(0);
  });
});
