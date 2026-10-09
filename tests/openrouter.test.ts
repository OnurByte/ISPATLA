import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getArenaRankings, parseArenaRows, resetArenaCacheForTests } from "@/server/arena-rankings";
import { beginOpenRouterOAuth, disconnectOpenRouter, finishOpenRouterOAuth, openRouterConnected } from "@/server/openrouter-oauth";
import { runAsOwner } from "@/server/owner-context";
import { readSecret, removeSecret } from "@/server/vault";
import { setAiSettings, testAiConnection } from "@/server/ai";
import { saveSecret } from "@/server/vault";
import { getSetting, setSetting } from "@/server/db";
import { jevConfig, jevScore, setJevTransportForTests } from "@/server/jev";

function runIsolatedOpenRouterTests(): void {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-openrouter-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "test", "tests/openrouter.test.ts"],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_SECRET_KEY: "openrouter-fixture-vault-key", OPENROUTER_TEST_CHILD: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${new TextDecoder().decode(result.stdout)}\n${new TextDecoder().decode(result.stderr)}`;
    expect(result.exitCode, output).toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

if (process.env.OPENROUTER_TEST_CHILD === "1") describe("OpenRouter account connection", () => {
  test("routes structured model checks through the fixed OpenRouter API using the owner key", async () => {
    const oldVault = process.env.ISPATLA_SECRET_KEY;
    const oldFetch = globalThis.fetch;
    process.env.ISPATLA_SECRET_KEY = "openrouter-provider-test-key";
    const seen: Array<{ url: string; authorization: string | null }> = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), authorization: new Headers(init?.headers).get("authorization") });
      return Response.json({ choices: [{ message: { content: "{\"ok\":true}" } }] });
    }) as unknown as typeof fetch;
    try {
      await runAsOwner("openrouter-provider-owner", async () => {
        saveSecret("openrouter_api_key", "OpenRouter", "sk-or-v1-owner-specific-test-key");
        setAiSettings("openrouter", "vendor/model");
        expect(await testAiConnection()).toEqual({ ok: true, provider: "openrouter", model: "vendor/model" });
        expect(seen).toEqual([{ url: "https://openrouter.ai/api/v1/chat/completions", authorization: "Bearer sk-or-v1-owner-specific-test-key" }]);
        removeSecret("openrouter_api_key");
      });
    } finally {
      globalThis.fetch = oldFetch;
      if (oldVault === undefined) delete process.env.ISPATLA_SECRET_KEY; else process.env.ISPATLA_SECRET_KEY = oldVault;
    }
  });

  test("Jev reuses the connected OpenRouter key and targets OpenRouter SystemOne", async () => {
    const oldVault = process.env.ISPATLA_SECRET_KEY;
    process.env.ISPATLA_SECRET_KEY = "jev-openrouter-test-key";
    const settingNames = ["jev_mode", "jev_provider", "jev_model", "jev_base_url"] as const;
    try {
      await runAsOwner("jev-openrouter-owner", async () => {
        const prior = Object.fromEntries(settingNames.map((name) => [name, getSetting(name, "")]));
        try {
        saveSecret("openrouter_api_key", "OpenRouter", "sk-or-v1-jev-owner-key");
        const now = Math.floor(Date.now() / 1000);
        setSetting("jev_mode", "shadow", now); setSetting("jev_provider", "openrouter", now); setSetting("jev_model", "typesafe/jev-1.13", now);
        expect(jevConfig().endpoint).toBe("https://openrouter.ai/api/v1/systemone");
        const seen: Array<{ url: string; auth: string | undefined; body: Record<string, unknown> }> = [];
        setJevTransportForTests(async (request) => {
          seen.push({ url: request.url, auth: request.headers.authorization, body: JSON.parse(request.body) });
          return { status: 200, text: JSON.stringify({ answers: { f0_c0: { type: "score", score: 2 } }, usage: { input_tokens: 10, output_tokens: 2 }, model: "typesafe/jev-1.13" }) };
        });
        const result = await jevScore({ query: `shared-key-${Date.now()}`, facets: ["technology"], candidates: [{ id: "c1", title: "Example", statement: "Evidence", scope: "public", domains: ["technology"] }] });
        expect(result.degraded).toBe(false);
        expect(seen[0]).toMatchObject({ url: "https://openrouter.ai/api/v1/systemone", auth: "Bearer sk-or-v1-jev-owner-key" });
        expect(seen[0]?.body.model).toBe("typesafe/jev-1.13");
        } finally {
          setJevTransportForTests(null);
          for (const name of settingNames) setSetting(name, prior[name] || "", Math.floor(Date.now() / 1000));
          removeSecret("openrouter_api_key");
        }
      });
    } finally { if (oldVault === undefined) delete process.env.ISPATLA_SECRET_KEY; else process.env.ISPATLA_SECRET_KEY = oldVault; }
  });

  test("uses owner-scoped PKCE state, exchanges once, and stores key only in the vault", async () => {
    const oldVault = process.env.ISPATLA_SECRET_KEY;
    process.env.ISPATLA_SECRET_KEY = "openrouter-oauth-test-key";
    try {
      await runAsOwner("openrouter-oauth-owner", async () => {
        disconnectOpenRouter();
        const callback = "https://app.example/api/settings/openrouter/callback";
        const authorization = new URL(beginOpenRouterOAuth(callback, 1000));
        expect(authorization.origin).toBe("https://openrouter.ai");
        expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
        const state = authorization.searchParams.get("state")!;
        let exchanged: Record<string, unknown> = {};
        await finishOpenRouterOAuth({ state, code: "single-use-code", callbackUrl: callback, now: 2000, fetcher: async (_url, init) => {
          exchanged = JSON.parse(String(init?.body));
          return Response.json({ key: "sk-or-v1-test-credential-value" });
        } });
        expect(exchanged.code).toBe("single-use-code");
        expect(exchanged.code_challenge_method).toBe("S256");
        expect(typeof exchanged.code_verifier).toBe("string");
        expect(createHash("sha256").update(String(exchanged.code_verifier)).digest("base64url")).toBe(authorization.searchParams.get("code_challenge") || "");
        expect(openRouterConnected()).toBe(true);
        expect(readSecret("openrouter_api_key")).toBe("sk-or-v1-test-credential-value");
        await expect(finishOpenRouterOAuth({ state, code: "replay", callbackUrl: callback, now: 2001, fetcher: async () => Response.json({ key: "sk-or-v1-replay" }) })).rejects.toThrow("invalid_or_expired_callback");
        disconnectOpenRouter();
        expect(openRouterConnected()).toBe(false);
      });
    } finally {
      removeSecret("openrouter_oauth_pending"); removeSecret("openrouter_oauth_generation"); removeSecret("openrouter_api_key");
      if (oldVault === undefined) delete process.env.ISPATLA_SECRET_KEY; else process.env.ISPATLA_SECRET_KEY = oldVault;
    }
  });

  test("disconnect cancels a token exchange already in flight", async () => {
    const oldVault = process.env.ISPATLA_SECRET_KEY;
    process.env.ISPATLA_SECRET_KEY = "openrouter-cancel-test-key";
    try {
      await runAsOwner("openrouter-cancel-owner", async () => {
        disconnectOpenRouter();
        const callback = "https://app.example/api/settings/openrouter/callback";
        const authorization = new URL(beginOpenRouterOAuth(callback));
        let resolveResponse!: (response: Response) => void;
        let notifyStarted!: () => void;
        const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
        const pending = finishOpenRouterOAuth({ state: authorization.searchParams.get("state") || "", code: "cancel-me", callbackUrl: callback, fetcher: async () => {
          notifyStarted();
          return new Promise<Response>((resolve) => { resolveResponse = resolve; });
        } });
        await started;
        disconnectOpenRouter();
        resolveResponse(Response.json({ key: "sk-or-v1-must-not-survive-cancel" }));
        await expect(pending).rejects.toThrow("connection_cancelled");
        expect(openRouterConnected()).toBe(false);
      });
    } finally {
      removeSecret("openrouter_oauth_pending"); removeSecret("openrouter_oauth_generation"); removeSecret("openrouter_api_key");
      if (oldVault === undefined) delete process.env.ISPATLA_SECRET_KEY; else process.env.ISPATLA_SECRET_KEY = oldVault;
    }
  });

  test("rejects malformed Arena rows and returns true ranked values from validated rows", async () => {
    expect(parseArenaRows({ rows: [{ row: { rank: "first", model_name: "bad" } }] }).available).toBe(false);
    resetArenaCacheForTests();
    let calls = 0;
    const result = await getArenaRankings(async (url) => {
      calls++;
      expect(String(url)).toContain("dataset=lmarena-ai%2Fleaderboard-dataset");
      return Response.json({ rows: [
        { row: { rank: 2, model_name: "org/model-two", organization: "org", rating: 1400.25, vote_count: 200, category: "overall", leaderboard_publish_date: "2026-10-08" } },
        { row: { rank: 1, model_name: "org/model-one", organization: "org", rating: 1500, vote_count: 300, category: "overall", leaderboard_publish_date: "2026-10-08" } },
        { row: { rank: 1, model_name: "not-overall", organization: "org", rating: 1500, vote_count: 300, category: "coding", leaderboard_publish_date: "2026-10-08" } },
      ] });
    });
    expect(result.models.map((model) => model.name)).toEqual(["org/model-one", "org/model-two"]);
    expect(result.models[0]?.rating).toBe(1500);
    expect((await getArenaRankings(async () => { calls++; throw new Error("should be cached"); })).available).toBe(true);
    expect(calls).toBe(1);
    resetArenaCacheForTests();
  });
});
else test("OpenRouter integration fixtures use a temporary database", runIsolatedOpenRouterTests);
