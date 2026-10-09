import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runIsolated(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-ai-budget-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("atomic owner-scoped reservations prevent concurrent overspend and release known failures", () => {
  const output = runIsolated(`
    import { ensureDatabase, reserveAiBudget, settleAiBudgetReservation, setSetting } from "./src/server/db.ts";
    import { runAsOwner } from "./src/server/owner-context.ts";
    if (!ensureDatabase()) throw new Error("database unavailable");
    const now = Math.floor(Date.now() / 1000);
    const reserve = (owner, id) => runAsOwner(owner, () => reserveAiBudget({ id, task: "score", provider: "api", model: "gpt-4.1-mini", reservedUsd: 0.001, now }));
    runAsOwner("budget-a", () => setSetting("ai_daily_budget_usd", "0.001", now));
    runAsOwner("budget-a", () => setSetting("ai_monthly_budget_usd", "0.001", now));
    const first = reserve("budget-a", "first");
    const secondWhilePending = reserve("budget-a", "second");
    const otherOwner = reserve("budget-b", "other-owner");
    if (first.allowed) runAsOwner("budget-a", () => settleAiBudgetReservation(first.id, { outcome: "known_failure", now }));
    const afterRefund = reserve("budget-a", "after-refund");
    console.log(JSON.stringify({ first, secondWhilePending, otherOwner, afterRefund }));
  `);
  const result = JSON.parse(output);
  expect(result.first.allowed).toBe(true);
  expect(result.secondWhilePending.allowed).toBe(false);
  expect(result.otherOwner.allowed).toBe(true);
  expect(result.afterRefund.allowed).toBe(true);
});

test("ambiguous reservations remain charged against capacity and unknown cost is not recorded as zero", () => {
  const output = runIsolated(`
    import { ensureDatabase, getUsageSummary, reserveAiBudget, settleAiBudgetReservation, setSetting } from "./src/server/db.ts";
    import { runAsOwner } from "./src/server/owner-context.ts";
    if (!ensureDatabase()) throw new Error("database unavailable");
    const now = Math.floor(Date.now() / 1000);
    const result = runAsOwner("unknown-cost-owner", () => {
      setSetting("ai_monthly_budget_usd", "1", now);
      const unknown = reserveAiBudget({ id: "unknown", task: "connection_test", provider: "compatible", model: "vendor/model", reservedUsd: null, now });
      const known = reserveAiBudget({ id: "ambiguous", task: "text", provider: "api", model: "gpt-4.1-mini", reservedUsd: 0.5, now });
      settleAiBudgetReservation(known.id, { outcome: "ambiguous", now });
      const blocked = reserveAiBudget({ id: "blocked", task: "text", provider: "api", model: "gpt-4.1-mini", reservedUsd: 0.6, now });
      return { unknown, known, blocked, summary: getUsageSummary(now - 60) };
    });
    console.log(JSON.stringify(result));
  `);
  const result = JSON.parse(output);
  expect(result.unknown.allowed).toBe(false);
  expect(result.known.allowed).toBe(true);
  expect(result.blocked.allowed).toBe(false);
  expect(result.summary.unknownCostEvents).toBe(0);
});

test("compatible calls with a configured dollar cap fail closed before network when cost is unknown; uncapped calls report unknown cost", () => {
  const output = runIsolated(`
    import { ensureDatabase, getSetting, setSetting } from "./src/server/db.ts";
    import { requestAiText, setAiEnabled, setAiSettings, setCompatibleSettings, testAiConnection } from "./src/server/ai.ts";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { getUsageSummary } from "./src/server/db.ts";
    import { saveSecret } from "./src/server/vault.ts";
    if (!ensureDatabase()) throw new Error("database unavailable");
    process.env.ISPATLA_SECRET_KEY = "ai-budget-vault-key";
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init.body));
      const schema = body.response_format.json_schema.name;
      return Response.json({ choices: [{ message: { content: JSON.stringify(schema === "ispatla_connection_test" ? { ok: true } : { text: "ok" }) } }] });
    };
    const result = await runAsOwner("compatible-budget-owner", async () => {
      setAiEnabled(true);
      setCompatibleSettings("https://gateway.example/v1", "Gateway");
      saveSecret("compatible_api_key", "OpenAI-compatible", "test-compatible-key");
      setAiSettings("compatible", "vendor/model");
      setSetting("ai_monthly_budget_usd", "1", Math.floor(Date.now() / 1000));
      let limitedError = "";
      try { await testAiConnection(); } catch (error) { limitedError = String(error); }
      setSetting("ai_monthly_budget_usd", "0", Math.floor(Date.now() / 1000));
      await testAiConnection();
      await requestAiText({ evidence: "evidence", instructions: "instructions" });
      return { limitedError, calls, summary: getUsageSummary(0) };
    });
    console.log(JSON.stringify(result));
  `);
  const result = JSON.parse(output);
  expect(result.limitedError).toContain("budget");
  expect(result.calls).toBe(2);
  expect(result.summary.unknownCostEvents).toBe(2);
  expect(result.summary.estimatedUsd).toBe(0);
});

test("request reservations are claimed before concurrent provider calls and provider usage is recorded without exposing payloads", () => {
  const output = runIsolated(`
    import { ensureDatabase, getUsageSummary, setSetting } from "./src/server/db.ts";
    import { requestAiText, setAiEnabled, setAiSettings } from "./src/server/ai.ts";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { saveSecret } from "./src/server/vault.ts";
    if (!ensureDatabase()) throw new Error("database unavailable");
    process.env.ISPATLA_SECRET_KEY = "reported-usage-vault-key";
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return Response.json({ output_text: JSON.stringify({ text: "done" }), usage: { input_tokens: 12, output_tokens: 4, cost: 0.0003 } });
    };
    const result = await runAsOwner("concurrent-owner", async () => {
      saveSecret("openai_api_key", "OpenAI", "private-api-key");
      setAiEnabled(true);
      setAiSettings("api", "gpt-4.1-mini");
      const now = Math.floor(Date.now() / 1000);
      setSetting("ai_daily_budget_usd", "0.001", now);
      setSetting("ai_monthly_budget_usd", "0.001", now);
      const requests = await Promise.allSettled([
        requestAiText({ evidence: "a", instructions: "b" }),
        requestAiText({ evidence: "a", instructions: "b" }),
      ]);
      return { requests: requests.map((item) => item.status), calls, summary: getUsageSummary(0) };
    });
    console.log(JSON.stringify(result));
  `);
  const result = JSON.parse(output);
  expect(result.requests.sort()).toEqual(["fulfilled", "rejected"]);
  expect(result.calls).toBe(1);
  expect(result.summary.reportedUsd).toBe(0.0003);
  expect(result.summary.inputTokens).toBe(12);
  expect(result.summary.outputTokens).toBe(4);
});
