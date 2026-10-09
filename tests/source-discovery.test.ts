import { describe, expect, test } from "bun:test";
import { aiConfigured, canUseCodexProvider, codexCapabilityForCurrentContext, codexEnvironment, getAiSettings, getCompatibleSettings, isAiEnabled, needsTerraReview, parseAiScore, requestAiScore, requestAiText, requestDraftSemanticFeatures, reviewModel, setAiEnabled, setAiSettings, setCompatibleSettings, testAiConnection } from "@/server/ai";
import { getSetting, setSetting } from "@/server/db";
import { runAsOwner } from "@/server/owner-context";
import { automationEnabled, isDefinitiveMissingSourceError } from "@/server/pipeline";
import { extractDiscoveryEvidence, mergeEvidence, nextSourceState, sourceDueForScoring } from "@/server/sources";

const sourceScore = {
  score: 80, risk: 10, confidence: 90, reason: "Kaynaklı ve güncel.",
  niche: "haber", topics: ["gündem"], tone: "doğrudan",
};

describe("source discovery and AI lifecycle", () => {
  test("liveness checker only treats definitive missing errors as dead", () => {
    expect(isDefinitiveMissingSourceError(new Error("404 Not Found"))).toBe(true);
    expect(isDefinitiveMissingSourceError(new Error("network timeout"))).toBe(false);
  });

  test("extracts and weights quote, reply and mention accounts without the parent", () => {
    const evidence = extractDiscoveryEvidence("seed", {
      quote: { author: { screen_name: "QuotedNews" } },
      replying_to: { screen_name: "ReplyNews" },
      raw_text: { facets: [
        { type: "mention", original: "@MentionedNews" },
        { type: "mention", original: "@seed" },
      ] },
    });

    expect(evidence).toEqual([
      { handle: "quotednews", weight: 3, parentHandles: ["seed"] },
      { handle: "replynews", weight: 2, parentHandles: ["seed"] },
      { handle: "mentionednews", weight: 1, parentHandles: ["seed"] },
    ]);
  });

  test("keeps a source when only AI score is low", () => {
    const profile = mergeEvidence({ parentHandles: ["one"], evidenceWeight: 2 }, {
      handle: "candidate",
      weight: 3,
      parentHandles: ["two"],
    }, 1000);
    expect(profile.evidenceWeight).toBe(5);
    expect(profile.parentHandles).toEqual(["one", "two"]);
    expect(sourceDueForScoring(profile, 1000 + 86400)).toBe(true);

    const first = nextSourceState(profile, 20, 90);
    const second = nextSourceState({ ...profile, lowScoreStreak: first.lowScoreStreak }, 20, 90);
    const third = nextSourceState({ ...profile, lowScoreStreak: second.lowScoreStreak }, 20, 90);
    expect(first.deleteReady).toBe(false);
    expect(second.deleteReady).toBe(false);
    expect(third.deleteReady).toBe(false);
  });

  test("promotes only confident candidates with independent parent evidence", () => {
    expect(nextSourceState({ status: "candidate", evidenceWeight: 3, parentHandles: ["one"] }, 70, 70)).toMatchObject({ status: "candidate", enabled: false });
    expect(nextSourceState({ status: "candidate", evidenceWeight: 3, parentHandles: ["one", "two"] }, 70, 70)).toMatchObject({ status: "active", enabled: true });
    expect(nextSourceState({ status: "candidate", evidenceWeight: 2 }, 95, 95)).toMatchObject({ status: "candidate", enabled: false });
  });

  test("validates model output, routes reviews and applies hard risk gates", () => {
    const score = parseAiScore({ ...sourceScore, score: 72 }, "gpt-5.6-luna");
    expect(needsTerraReview(score)).toBe(true);
    expect(needsTerraReview({ ...score, confidence: 90, score: 80 })).toBe(false);
    expect(() => parseAiScore({ ...sourceScore, score: "x" }, "test")).toThrow();
  });

  test("keeps app secrets out of the Codex environment", () => {
    expect(codexEnvironment({
      HOME: "/tmp/user",
      PATH: "/usr/bin",
      HTTPS_PROXY: "http://proxy.example",
      ISPATLA_SECRET_KEY: "vault-secret",
      ISPATLA_ADMIN_TOKEN: "admin-secret",
      OPENAI_API_KEY: "api-secret",
    })).toEqual({ HOME: "/tmp/user", PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example" });
  });

  test("fails closed for the shared Codex CLI outside the configured production operator context", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousOperatorId = process.env.ISPATLA_OPERATOR_USER_ID;
    const originalProviderSetting = getSetting("ai_provider", "api");
    const originalModelSetting = getSetting("ai_model", "gpt-5.6-luna");
    Reflect.set(process.env, "NODE_ENV", "production");
    delete process.env.ISPATLA_OPERATOR_USER_ID;
    try {
      const blockedRequests = runAsOwner("codex-tenant", async () => {
        expect(canUseCodexProvider()).toBe(false);
        expect(codexCapabilityForCurrentContext()).toEqual({
          available: false,
          authenticated: false,
          bin: "",
          version: "",
          reason: "Codex CLI is unavailable in this production context.",
        });
        expect(aiConfigured({ provider: "codex", model: "codex-mini-latest" })).toBe(false);
        expect(() => setAiSettings("codex", "codex-mini-latest")).toThrow("unavailable");
        await expect(requestAiScore({ evidence: "test", provider: "codex", model: "codex-mini-latest" })).rejects.toThrow("unavailable");
        await expect(requestAiText({ evidence: "test", instructions: "test", provider: "codex", model: "codex-mini-latest" })).rejects.toThrow("unavailable");
        await expect(requestDraftSemanticFeatures({ text: "test", provider: "codex", model: "codex-mini-latest" })).rejects.toThrow("unavailable");
      });
      await blockedRequests;

      // An ownerless background worker is also outside the explicitly configured operator context.
      expect(canUseCodexProvider()).toBe(false);
      expect(() => setAiSettings("codex", "codex-mini-latest")).toThrow("unavailable");
      await expect(requestAiScore({ evidence: "test", provider: "codex", model: "codex-mini-latest" })).rejects.toThrow("unavailable");
      await expect(requestAiText({ evidence: "test", instructions: "test", provider: "codex", model: "codex-mini-latest" })).rejects.toThrow("unavailable");
      await expect(requestDraftSemanticFeatures({ text: "test", provider: "codex", model: "codex-mini-latest" })).rejects.toThrow("unavailable");

      process.env.ISPATLA_OPERATOR_USER_ID = "self-hosted-operator";
      await runAsOwner("ordinary-tenant", async () => {
        expect(canUseCodexProvider()).toBe(false);
        expect(() => setAiSettings("codex", "codex-mini-latest")).toThrow("unavailable");
      });
      await runAsOwner("self-hosted-operator", async () => {
        expect(canUseCodexProvider()).toBe(true);
        expect(setAiSettings("codex", "codex-mini-latest")).toEqual({ provider: "codex", model: "codex-mini-latest" });
      });
    } finally {
      const now = Math.floor(Date.now() / 1000);
      setSetting("ai_provider", originalProviderSetting, now);
      setSetting("ai_model", originalModelSetting, now);
      if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
      else Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
      if (previousOperatorId === undefined) Reflect.deleteProperty(process.env, "ISPATLA_OPERATOR_USER_ID");
      else Reflect.set(process.env, "ISPATLA_OPERATOR_USER_ID", previousOperatorId);
    }
  });

  test("blocks scoring when AI is disabled or the monthly budget is exhausted", async () => {
    const enabled = isAiEnabled();
    const budget = getSetting("ai_monthly_budget_usd", "0");
    const previousFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response(); }) as unknown as typeof fetch;
    try {
      setAiEnabled(false);
      await expect(requestAiScore({ evidence: "kanıt", provider: "api", model: "gpt-5.6-luna" })).rejects.toThrow("AI kullanımı kapalı");
      setAiEnabled(true);
      setSetting("ai_monthly_budget_usd", "0.000001", Math.floor(Date.now() / 1000));
      await expect(requestAiScore({ evidence: "kanıt", provider: "api", model: "gpt-5.6-luna" })).rejects.toThrow("tahmini kullanım eşiği");
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = previousFetch;
      setAiEnabled(enabled);
      setSetting("ai_monthly_budget_usd", budget, Math.floor(Date.now() / 1000));
    }
  });

  test("validates source context without requiring or returning political classification", () => {
    const score = parseAiScore({
      score: 80,
      risk: 15,
      confidence: 88,
      reason: "Kaynak kalitesi iyi.",
      niche: "ekonomi ve finans",
      topics: ["borsa", "enflasyon"],
      tone: "analitik",
    }, "gpt-5.6-luna", "api");
    expect(score.sourceContext).toEqual({ niche: "ekonomi ve finans", topics: ["borsa", "enflasyon"], tone: "analitik" });
    expect(score).not.toHaveProperty("political");
    expect(parseAiScore({ ...sourceScore, ideology: "legacy-only", ideologyTags: ["legacy"] }, "gpt-5.6-luna", "api")).not.toHaveProperty("political");
    expect(() => parseAiScore({ score: 80, risk: 15, confidence: 88, reason: "eksik" }, "gpt-5.6-luna", "api")).toThrow();
  });

  test("requests Luna medium structured output without storing the response", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> = {};
    process.env.OPENAI_API_KEY = "test-only-key";
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ output_text: JSON.stringify(sourceScore) }));
    }) as typeof fetch;
    try {
      const result = await requestAiScore({ evidence: "kanıt", provider: "api", model: "gpt-5.6-luna" });
      expect(result.model).toBe("gpt-5.6-luna");
      expect(requestBody.store).toBe(false);
      expect(requestBody.reasoning).toEqual({ effort: "medium" });
      expect(requestBody.text).toMatchObject({ format: { type: "json_schema", strict: true } });
      const schema = (requestBody.text as { format: { schema: { properties: Record<string, unknown>; required: string[] } } }).format.schema;
      expect(schema.properties).not.toHaveProperty("ideology");
      expect(schema.required).not.toContain("ideology");
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  test("uses an arbitrary model through a configured OpenAI-compatible endpoint", async () => {
    const previousKey = process.env.AI_COMPATIBLE_API_KEY;
    const previousFetch = globalThis.fetch;
    const previous = getCompatibleSettings();
    const previousAi = getAiSettings();
    let url = "";
    let body: Record<string, unknown> = {};
    process.env.AI_COMPATIBLE_API_KEY = "test-only-key";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const schemaName = (body.response_format as { json_schema?: { name?: string } })?.json_schema?.name;
      const content = schemaName === "ispatla_connection_test" ? { ok: true } : sourceScore;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
    }) as unknown as typeof fetch;
    try {
      setCompatibleSettings("https://gateway.example/v1", "Test gateway");
      setAiSettings("compatible", "any-vendor/model-v1");
      await testAiConnection();
      const result = await requestAiScore({ evidence: "kanıt", provider: "compatible", model: "any-vendor/model-v1" });
      expect(result.provider).toBe("compatible");
      expect(url).toBe("https://gateway.example/v1/chat/completions");
      expect(body.model).toBe("any-vendor/model-v1");
      expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    } finally {
      globalThis.fetch = previousFetch;
      const now = Math.floor(Date.now() / 1000);
      setSetting("ai_compatible_base_url", previous.baseUrl, now);
      setSetting("ai_compatible_name", previous.name, now);
      setSetting("ai_provider", previousAi.provider, now);
      setSetting("ai_model", previousAi.model, now);
      if (previousKey === undefined) delete process.env.AI_COMPATIBLE_API_KEY;
      else process.env.AI_COMPATIBLE_API_KEY = previousKey;
    }
  });

  test("accepts provider model identifiers beyond the suggestion list", () => {
    const current = getAiSettings();
    try {
      const settings = setAiSettings("api", "future-openai-model");
      expect(settings).toEqual({ provider: "api", model: "future-openai-model" });
      expect(reviewModel("api", settings.model)).toBe(settings.model);
    } finally {
      setAiSettings(current.provider, current.model);
    }
  });

  test("keeps discovery reads available while automation publishing is paused", () => {
    const current = getSetting("automation_paused", "0");
    try {
      setSetting("automation_paused", "1", Math.floor(Date.now() / 1000));
      expect(automationEnabled()).toBe(false);
    } finally {
      setSetting("automation_paused", current, Math.floor(Date.now() / 1000));
    }
  });
});
