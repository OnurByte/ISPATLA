import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runIsolatedDatabase(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-phase0-db-"));
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

test("publication confirmation requires a dispatched intent for the same account and draft", () => {
  const output = runIsolatedDatabase(`
    import { createDraft, createPublicationIntent, ensureDatabase, getPublicationIntent, recordPublishAttempt, saveAccount, updatePublicationIntent, upsertPost, confirmPublish, syncIntentPublication } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], now: 1 });
    const post = { externalId: "source-1", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "source", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 1, scoreReason: "heuristic:{}", sensitive: false, clusterKey: "cluster-1" };
    upsertPost(post, 2);
    const draft = createDraft({ externalId: post.externalId, accountId: account.id, format: "post", text: "draft", now: 2 });
    const attempt = (reason = "waiting") => recordPublishAttempt({ externalId: post.externalId, accountId: account.id, status: "pending_reconciliation", reason, receipt: "", remoteUrl: "https://x.com/publisher/status/123", now: 3 });
    attempt();
    const { Database } = await import("bun:sqlite");
    const db = new Database(process.env.ISPATLA_DB!, { strict: true });
    const attemptId = db.query("SELECT id FROM publish_attempts").get().id;
    confirmPublish(attemptId, post.externalId);
    const unlinked = db.query("SELECT status FROM publish_attempts WHERE id=?").get(attemptId).status;
    const noDispatchDraft = createDraft({ externalId: "", accountId: account.id, format: "post", text: "not dispatched", now: 3 });
    const noDispatchIntent = createPublicationIntent({ draftId: noDispatchDraft.id, accountId: account.id, idempotencyKey: "no-dispatch", text: "not dispatched", now: 3 });
    updatePublicationIntent({ id: noDispatchIntent.id, status: "confirmed", confirmedAt: 3, now: 3 });
    syncIntentPublication(noDispatchIntent.id, 3);
    const unDispatchedPublicationCount = db.query("SELECT COUNT(*) AS count FROM publications WHERE publication_intent_id=?").get(noDispatchIntent.id).count;
    const intent = createPublicationIntent({ draftId: draft.id, accountId: account.id, idempotencyKey: "dispatch-1", text: "draft", now: 4 });
    updatePublicationIntent({ id: intent.id, status: "approved", approvedAt: 4, now: 4 });
    const { claimPublicationIntentDispatch } = await import("./src/server/db.ts");
    const claimed = claimPublicationIntentDispatch(intent.id, 5);
    updatePublicationIntent({ id: intent.id, status: "pending_reconciliation", now: 6 });
    recordPublishAttempt({ externalId: post.externalId, accountId: account.id, publicationIntentId: intent.id, status: "pending_reconciliation", reason: "waiting", receipt: "", remoteUrl: "https://x.com/publisher/status/123", now: 3 });
    const linkedAttemptId = Number(db.query("SELECT MAX(id) AS id FROM publish_attempts").get().id);
    updatePublicationIntent({ id: intent.id, status: "confirmed", confirmedAt: 7, now: 7 });
    confirmPublish(linkedAttemptId, post.externalId);
    console.log(JSON.stringify({ unlinked, unDispatchedPublicationCount, claimed: claimed?.status, linked: db.query("SELECT status FROM publish_attempts WHERE id=?").get(linkedAttemptId).status, dispatchedAt: getPublicationIntent(intent.id)?.dispatchedAt }));
  `);
  expect(JSON.parse(output)).toEqual({ unlinked: "pending_reconciliation", unDispatchedPublicationCount: 0, claimed: "dispatching", linked: "confirmed", dispatchedAt: 5 });
});

test("job claims enforce schedule, increment attempts once, and cancelled retries get a new identity", () => {
  const output = runIsolatedDatabase(`
    import { claimAutomationJob, createDraft, createJob, ensureDatabase, getJob, updateJob } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const draft = createDraft({ externalId: "", format: "post", text: "draft", now: 1 });
    const original = createJob({ draftId: draft.id, action: "post", scheduledAt: 10, now: 1 });
    const early = claimAutomationJob(original.id, 9);
    const claim = claimAutomationJob(original.id, 10);
    const duplicate = claimAutomationJob(original.id, 11);
    updateJob({ id: original.id, status: "cancelled", now: 12 });
    const retry = updateJob({ id: original.id, status: "queued", now: 13 });
    console.log(JSON.stringify({ early, claimedAttempts: claim?.attempts, duplicate, originalId: original.id, originalStatus: getJob(original.id)?.status, retryId: retry?.id, retryStatus: retry?.status, jobAttempts: getJob(original.id)?.attempts }));
  `);
  expect(JSON.parse(output)).toEqual({ early: null, claimedAttempts: 1, duplicate: null, originalId: 1, originalStatus: "cancelled", retryId: 2, retryStatus: "queued", jobAttempts: 1 });
});

test("cancelled publication intents stay cancelled and stale job recovery uses a conditional transition", () => {
  const output = runIsolatedDatabase(`
    import { createDraft, createPublicationIntent, createJob, ensureDatabase, getJob, recoverStaleAutomationJob, saveAccount, updateJob, updatePublicationIntent } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now: 1 });
    const draft = createDraft({ externalId: "", accountId: account.id, format: "post", text: "draft", now: 1 });
    const original = createPublicationIntent({ draftId: draft.id, accountId: account.id, idempotencyKey: "same", text: "draft", now: 2 });
    updatePublicationIntent({ id: original.id, status: "cancelled", now: 3 });
    const retry = createPublicationIntent({ draftId: draft.id, accountId: account.id, idempotencyKey: "same", text: "draft", now: 4 });
    const job = createJob({ draftId: draft.id, accountId: account.id, action: "post", scheduledAt: 1, now: 1 });
    updateJob({ id: job.id, status: "running", now: 2 });
    updateJob({ id: job.id, status: "confirmed", now: 10 });
    const recovered = recoverStaleAutomationJob({ id: job.id, cutoff: 5, status: "reconciliation_required", reason: "stale", now: 11 });
    console.log(JSON.stringify({ originalId: original.id, originalStatus: "cancelled", retryId: retry.id, retryStatus: retry.status, recovered, jobStatus: getJob(job.id)?.status }));
  `);
  expect(JSON.parse(output)).toEqual({ originalId: 1, originalStatus: "cancelled", retryId: 2, retryStatus: "pending_approval", recovered: false, jobStatus: "confirmed" });
});

test("migration 19 preserves legacy attempts and adds nullable intent lineage", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-phase0-migration-"));
  const database = join(directory, "state.sqlite3");
  const run = (script: string) => Bun.spawnSync({ cmd: [process.execPath, "-e", script], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: database }, stdout: "pipe", stderr: "pipe" });
  try {
    const before = run(`
      import { createDraft, ensureDatabase, recordPublishAttempt, saveAccount } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("database did not initialize");
      const account = saveAccount({ accountKey: "legacy", handle: "legacy", displayName: "Legacy", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: [], styleProfile: {}, now: 1 });
      const draft = createDraft({ externalId: "legacy-post", accountId: account.id, format: "post", text: "legacy", now: 1 });
      recordPublishAttempt({ externalId: draft.externalId, accountId: account.id, status: "pending_reconciliation", reason: "legacy attempt", receipt: "", now: 2 });
      const { Database } = await import("bun:sqlite");
      const db = new Database(process.env.ISPATLA_DB!);
      db.exec("DROP INDEX publish_attempts_intent_idx; ALTER TABLE publish_attempts DROP COLUMN publication_intent_id; DELETE FROM schema_migrations WHERE version=19;");
    `);
    expect(before.exitCode, new TextDecoder().decode(before.stderr)).toBe(0);
    const after = run(`
      import { ensureDatabase } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("database migration failed");
      const { Database } = await import("bun:sqlite");
      const db = new Database(process.env.ISPATLA_DB!);
      console.log(JSON.stringify({ version: db.query("SELECT version FROM schema_migrations WHERE version=19").get().version, attempt: db.query("SELECT status, reason, publication_intent_id AS intentId FROM publish_attempts").get(), foreignKey: db.query("PRAGMA foreign_key_list(publish_attempts)").all().some((row) => row.from === "publication_intent_id" && row.table === "publication_intents"), index: db.query("SELECT name FROM sqlite_master WHERE type='index' AND name='publish_attempts_intent_idx'").get()?.name }));
    `);
    expect(after.exitCode, new TextDecoder().decode(after.stderr)).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(after.stdout))).toEqual({ version: 19, attempt: { status: "pending_reconciliation", reason: "legacy attempt", intentId: null }, foreignKey: true, index: "publish_attempts_intent_idx" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("intent confirmation only updates its own account and source attempt", () => {
  const output = runIsolatedDatabase(`
    import { confirmPublicationIntentAttempt, createDraft, createPublicationIntent, ensureDatabase, recordPublishAttempt, saveAccount, updatePublicationIntent } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], styleProfile: {}, now: 1 });
    const draft = createDraft({ externalId: "source-post", accountId: account.id, format: "post", text: "draft", now: 1 });
    const one = createPublicationIntent({ draftId: draft.id, accountId: account.id, idempotencyKey: "one", text: "one", now: 2 });
    const two = createPublicationIntent({ draftId: draft.id, accountId: account.id, idempotencyKey: "two", text: "two", now: 2 });
    for (const intent of [one, two]) updatePublicationIntent({ id: intent.id, status: "confirmed", dispatchedAt: 3, confirmedAt: 4, now: 4 });
    recordPublishAttempt({ externalId: draft.externalId, accountId: account.id, publicationIntentId: one.id, status: "pending_reconciliation", reason: "one", receipt: "", now: 5 });
    recordPublishAttempt({ externalId: draft.externalId, accountId: account.id, publicationIntentId: two.id, status: "pending_reconciliation", reason: "two", receipt: "", now: 5 });
    confirmPublicationIntentAttempt(two.id, 6);
    const { Database } = await import("bun:sqlite");
    const db = new Database(process.env.ISPATLA_DB!);
    console.log(JSON.stringify(db.query("SELECT publication_intent_id AS intentId, status FROM publish_attempts ORDER BY id").all()));
  `);
  expect(JSON.parse(output)).toEqual([{ intentId: 1, status: "pending_reconciliation" }, { intentId: 2, status: "confirmed" }]);
});

test("pending approvals use their own status query independently of publication history", () => {
  const output = runIsolatedDatabase(`
    import { createDraft, createPublicationIntent, ensureDatabase, getPendingPublicationIntents, saveAccount, updatePublicationIntent } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "publisher", handle: "publisher", displayName: "Publisher", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: ["post"], now: 1 });
    for (let i=0; i<110; i++) {
      const draft = createDraft({ externalId: "", accountId: account.id, format: "post", text: String(i), now: i+2 });
      const intent = createPublicationIntent({ draftId: draft.id, accountId: account.id, idempotencyKey: "intent-" + i, text: String(i), now: i+2 });
      if (i >= 5) updatePublicationIntent({ id: intent.id, status: "cancelled", now: i+3 });
    }
    console.log(JSON.stringify(getPendingPublicationIntents(20).map((intent) => intent.id)));
  `);
  expect(JSON.parse(output)).toHaveLength(5);
});
