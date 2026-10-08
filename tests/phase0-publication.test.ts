import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runIsolatedDatabase(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-phase0-pub-"));
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

test("direct automation dispatch obeys the pause and schedule guards", () => {
  const result = JSON.parse(runIsolatedDatabase(`
    import { createDraft, createJob, ensureDatabase, getJobs, saveAccount, setSetting } from "./src/server/db.ts";
    import { runAutomationJob } from "./src/server/queue-service.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = 1750000000;
    const account = saveAccount({ accountKey: "main", handle: "main", displayName: "Main", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now });
    const draft = createDraft({ externalId: "", accountId: account.id, format: "post", text: "A valid post draft with enough characters.", now });
    const job = createJob({ draftId: draft.id, accountId: account.id, action: "post", scheduledAt: now + 60, now });
    const early = await runAutomationJob(job.id, now);
    setSetting("publishing_paused", "1", now);
    const paused = await runAutomationJob(job.id, now + 120);
    console.log(JSON.stringify({ early, paused, job: getJobs(20).find((item) => item.id === job.id) }));
  `));
  expect(result.early).toMatchObject({ ok: false, reason: "job is not due" });
  expect(result.paused).toMatchObject({ ok: false, reason: "publishing is paused" });
  expect(result.job).toMatchObject({ status: "queued", attempts: 0 });
});

test("source-backed quality gates run even when source media rights are not cleared", () => {
  const result = JSON.parse(runIsolatedDatabase(`
    import { createDraft, createJob, ensureDatabase, getJobs, saveAccount, upsertPost } from "./src/server/db.ts";
    import { runAutomationJob } from "./src/server/queue-service.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = 1750000000;
    const account = saveAccount({ accountKey: "main", handle: "main", displayName: "Main", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now });
    upsertPost({ externalId: "123", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/123", text: "This is a sufficiently long source post that the short draft copies.", createdTimestamp: now, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, followers: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 0, scoreReason: "", sensitive: false, clusterKey: "123" }, now);
    const draft = createDraft({ externalId: "123", accountId: account.id, format: "post", text: "short draft", now });
    const job = createJob({ draftId: draft.id, accountId: account.id, action: "post", scheduledAt: now, now });
    const result = await runAutomationJob(job.id, now);
    console.log(JSON.stringify({ result, job: getJobs(20).find((item) => item.id === job.id) }));
  `));
  expect(result.result).toMatchObject({ ok: false, reason: "draft is too short" });
  expect(result.job).toMatchObject({ status: "blocked", attempts: 0 });
});

test("publication intent dispatch cannot bypass publishing_paused", () => {
  const result = JSON.parse(runIsolatedDatabase(`
    import { createDraft, ensureDatabase, getPublicationIntent, saveAccount, setSetting } from "./src/server/db.ts";
    import { approvePublicationIntent, createIntentForDraft, dispatchPublicationIntent } from "./src/server/publication-service.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = 1750000000;
    const account = saveAccount({ accountKey: "main", handle: "main", displayName: "Main", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now });
    const draft = createDraft({ externalId: "", accountId: account.id, format: "post", text: "A valid post draft with enough characters.", now });
    const intent = createIntentForDraft(draft.id, account.id, now);
    approvePublicationIntent(intent.id, now);
    setSetting("publishing_paused", "1", now);
    let reason = "";
    try { await dispatchPublicationIntent(intent.id); } catch (error) { reason = error instanceof Error ? error.message : String(error); }
    console.log(JSON.stringify({ reason, intent: getPublicationIntent(intent.id) }));
  `));
  expect(result.reason).toBe("publishing is paused");
  expect(result.intent.status).toBe("approved");
});

test("stale publication dispatches reconcile known receipts and quarantine unknown outcomes", () => {
  const result = JSON.parse(runIsolatedDatabase(`
    import { createDraft, createPublicationIntent, ensureDatabase, getPublicationIntent, saveAccount, updatePublicationIntent } from "./src/server/db.ts";
    import { recoverStalePublicationDispatches } from "./src/server/publication-service.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = 1750000000;
    const account = saveAccount({ accountKey: "main", handle: "main", displayName: "Main", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now });
    const knownDraft = createDraft({ externalId: "known", accountId: account.id, format: "post", text: "known receipt", now });
    const known = createPublicationIntent({ draftId: knownDraft.id, accountId: account.id, idempotencyKey: "known", text: knownDraft.text, now });
    updatePublicationIntent({ id: known.id, status: "dispatching", dispatchedAt: now - 600, remoteUrl: "https://x.com/main/status/123", now: now - 600 });
    const unknownDraft = createDraft({ externalId: "unknown", accountId: account.id, format: "post", text: "unknown receipt", now });
    const unknown = createPublicationIntent({ draftId: unknownDraft.id, accountId: account.id, idempotencyKey: "unknown", text: unknownDraft.text, now });
    updatePublicationIntent({ id: unknown.id, status: "dispatching", dispatchedAt: now - 600, now: now - 600 });
    const recovered = await recoverStalePublicationDispatches(now);
    console.log(JSON.stringify({ recovered, known: getPublicationIntent(known.id)?.status, unknown: getPublicationIntent(unknown.id)?.status }));
  `));
  expect(result).toEqual({ recovered: 2, known: "pending_reconciliation", unknown: "reconciliation_required" });
});
