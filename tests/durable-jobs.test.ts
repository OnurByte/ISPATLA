import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-durable-jobs-"));
  const database = join(directory, "state.sqlite3");
  const env = { ...process.env, ISPATLA_DB: database };
  return { directory, database, env };
}

function run(env: Record<string, string | undefined>, script: string): string {
  const result = Bun.spawnSync({ cmd: [process.execPath, "-e", script], cwd: process.cwd(), env, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}

test("lease queue fences workers, retries only known failures, dead-letters at the cap, and quarantines ambiguity", () => {
  const { directory, env } = fixture();
  try {
    const output = run(env, `
      import { ensureDatabase, createDraft, createJob, claimAutomationJobLease, renewAutomationJobLease, markAutomationJobRequestSent, finishAutomationJobLease, recoverExpiredAutomationJobs, getJob, getDeadLetterAutomationJobs, getAutomationJobEvents, retryDelaySeconds, saveAccount, createPublicationIntent, updatePublicationIntent, claimPublicationIntentLease, markPublicationIntentRequestSent, finishPublicationIntentLease, recoverExpiredPublicationIntents, getPublicationIntent, getPublicationIntentEvents, confirmPublicationIntentRemote } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("database unavailable");
      const draft = createDraft({ externalId: "", format: "post", text: "test", now: 1 });
      const ambiguous = createJob({ draftId: draft.id, action: "post", scheduledAt: 100, maxAttempts: 2, now: 1 });
      const tooEarly = claimAutomationJobLease({ id: ambiguous.id, now: 99, leaseSeconds: 10 });
      const first = claimAutomationJobLease({ id: ambiguous.id, now: 100, leaseSeconds: 10 });
      const wrongFinish = finishAutomationJobLease({ id: ambiguous.id, leaseToken: "wrong", outcome: "success", now: 101 });
      const renewed = first && renewAutomationJobLease({ id: ambiguous.id, leaseToken: first.leaseToken, now: 105, leaseSeconds: 10 });
      const marked = first && markAutomationJobRequestSent({ id: ambiguous.id, leaseToken: first.leaseToken, now: 106 });
      const markedAgain = first && markAutomationJobRequestSent({ id: ambiguous.id, leaseToken: first.leaseToken, now: 107 });
      const staleFinish = first && finishAutomationJobLease({ id: ambiguous.id, leaseToken: first.leaseToken, outcome: "success", now: 116 });
      const recovered = recoverExpiredAutomationJobs({ now: 116, random: () => 0 });
      const quarantined = getJob(ambiguous.id);

      const retryDraft = createDraft({ externalId: "", format: "post", text: "safe retry", now: 2 });
      const retryJob = createJob({ draftId: retryDraft.id, action: "generate", scheduledAt: 200, maxAttempts: 2, now: 2 });
      const retry1 = claimAutomationJobLease({ id: retryJob.id, now: 200, leaseSeconds: 60 });
      const retryResult1 = retry1 && finishAutomationJobLease({ id: retryJob.id, leaseToken: retry1.leaseToken, outcome: "retryable_failure", errorClass: "rate_limited", now: 201, baseDelaySeconds: 10, maxDelaySeconds: 16, random: () => 0.5 });
      const earlyRetry = claimAutomationJobLease({ id: retryJob.id, now: 215, leaseSeconds: 60 });
      const retry2 = claimAutomationJobLease({ id: retryJob.id, now: 216, leaseSeconds: 60 });
      const dead = retry2 && finishAutomationJobLease({ id: retryJob.id, leaseToken: retry2.leaseToken, outcome: "retryable_failure", errorClass: "rate_limited", now: 217, baseDelaySeconds: 10, maxDelaySeconds: 16, random: () => 1 });

      const account = saveAccount({ accountKey: "intent-account", handle: "intent-account", displayName: "", enabled: true, defaultAccount: false, automationMode: "manual", dailyLimit: 24, capabilities: [], now: 3 });
      const intentDraft = createDraft({ externalId: "", accountId: account.id, format: "post", text: "intent", now: 3 });
      const intent = createPublicationIntent({ draftId: intentDraft.id, accountId: account.id, idempotencyKey: "intent", text: "intent", now: 3 });
      updatePublicationIntent({ id: intent.id, status: "approved", now: 4 });
      const intentLease = claimPublicationIntentLease({ id: intent.id, now: 5, leaseSeconds: 10 });
      const intentSent = intentLease && markPublicationIntentRequestSent({ id: intent.id, leaseToken: intentLease.leaseToken, now: 6 });
      const intentSentAgain = intentLease && markPublicationIntentRequestSent({ id: intent.id, leaseToken: intentLease.leaseToken, now: 7 });
      const intentRecovered = recoverExpiredPublicationIntents({ now: 16 });
      const intentStatus = getPublicationIntent(intent.id)?.status;
      const staleIntentFinish = intentLease && finishPublicationIntentLease({ id: intent.id, leaseToken: intentLease.leaseToken, outcome: "accepted", now: 17 });

      const acceptedDraft = createDraft({ externalId: "", accountId: account.id, format: "post", text: "accepted", now: 30 });
      const accepted = createPublicationIntent({ draftId: acceptedDraft.id, accountId: account.id, idempotencyKey: "accepted", text: acceptedDraft.text, now: 30 });
      updatePublicationIntent({ id: accepted.id, status: "approved", now: 31 });
      const acceptedLease = claimPublicationIntentLease({ id: accepted.id, now: 32 });
      const acceptedSent = acceptedLease && markPublicationIntentRequestSent({ id: accepted.id, leaseToken: acceptedLease.leaseToken, now: 33 });
      const acceptedResult = acceptedLease && finishPublicationIntentLease({ id: accepted.id, leaseToken: acceptedLease.leaseToken, outcome: "accepted", receipt: "transport-accepted", remotePostId: "post-123", remoteUrl: "https://x.test/post-123", now: 34 });
      const confirmed = confirmPublicationIntentRemote({ id: accepted.id, remotePostId: "post-123", remoteUrl: "https://x.test/post-123", now: 35 });

      console.log(JSON.stringify({ tooEarly, wrongFinish, renewed, marked, markedAgain, staleFinish, recovered, quarantine: quarantined?.status, attempts: quarantined?.attempts, events: getAutomationJobEvents(ambiguous.id).map((event) => event.event), retryAt: retryResult1?.nextAttemptAt, earlyRetry, secondAttempt: retry2?.job.attempts, deadStatus: dead?.status, deadLetters: getDeadLetterAutomationJobs().map((job) => job.id), cappedDelay: retryDelaySeconds(99, { baseDelaySeconds: 10, maxDelaySeconds: 16, random: () => 1 }), intentSent, intentSentAgain, intentRecovered, intentStatus, staleIntentFinish, intentEvents: getPublicationIntentEvents(intent.id).map((event) => event.event), acceptedSent, acceptedStatus: acceptedResult?.status, acceptedReceipt: acceptedResult?.receipt, acceptedRemoteId: acceptedResult?.remotePostId, confirmedStatus: confirmed?.status, confirmedAt: confirmed?.confirmedAt }));
    `);
    expect(JSON.parse(output)).toEqual({
      tooEarly: null,
      wrongFinish: null,
      renewed: true,
      marked: true,
      markedAgain: false,
      staleFinish: null,
      recovered: 1,
      quarantine: "reconciliation_required",
      attempts: 1,
      events: ["created", "scheduled", "reserved", "heartbeat", "request_sent", "reconcile_started"],
      retryAt: 216,
      earlyRetry: null,
      secondAttempt: 2,
      deadStatus: "dead_letter",
      deadLetters: [2],
      cappedDelay: 16,
      intentSent: true,
      intentSentAgain: false,
      intentRecovered: 1,
      intentStatus: "reconciliation_required",
      staleIntentFinish: null,
      intentEvents: ["created", "approved", "dispatch_claimed", "request_sent", "reconcile_started"],
      acceptedSent: true,
      acceptedStatus: "pending_reconciliation",
      acceptedReceipt: "transport-accepted",
      acceptedRemoteId: "post-123",
      confirmedStatus: "confirmed",
      confirmedAt: 35,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("two processes cannot lease the same due job", async () => {
  const { directory, env } = fixture();
  try {
    const id = run(env, `import { ensureDatabase, createDraft, createJob } from "./src/server/db.ts"; ensureDatabase(); const d=createDraft({externalId:"",format:"post",text:"x",now:1}); console.log(createJob({draftId:d.id,action:"generate",scheduledAt:10,now:1}).id);`);
    const child = `import { ensureDatabase, claimAutomationJobLease } from "./src/server/db.ts"; ensureDatabase(); const lease=claimAutomationJobLease({id:${Number(id)},now:10}); console.log(lease ? "claimed" : "empty");`;
    const children = [0, 1].map(() => Bun.spawn({ cmd: [process.execPath, "-e", child], cwd: process.cwd(), env, stdout: "pipe", stderr: "pipe" }));
    const outputs = await Promise.all(children.map(async (process) => {
      const [stdout, stderr] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text()]);
      const code = await process.exited;
      if (code !== 0) throw new Error(stderr);
      return stdout.trim();
    }));
    expect(outputs.sort()).toEqual(["claimed", "empty"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("SIGKILL after a synthetic request quarantines the job without repeating its side effect", async () => {
  const { directory, database, env } = fixture();
  try {
    const id = run(env, `import { ensureDatabase, createDraft, createJob } from "./src/server/db.ts"; ensureDatabase(); const d=createDraft({externalId:"",format:"post",text:"x",now:1}); console.log(createJob({draftId:d.id,action:"post",scheduledAt:100,now:1}).id);`);
    const { Database } = process.getBuiltinModule("bun:sqlite") as { Database: new (path: string) => { exec(sql: string): void; close(): void } };
    const db = new Database(database);
    db.exec("CREATE TABLE synthetic_effects (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL);");
    db.close();
    const childScript = `import { ensureDatabase, claimAutomationJobLease, markAutomationJobRequestSent } from "./src/server/db.ts"; ensureDatabase(); const id=${Number(id)}; const lease=claimAutomationJobLease({id,now:100,leaseSeconds:10}); if(!lease) throw new Error("claim failed"); if(!markAutomationJobRequestSent({id,leaseToken:lease.leaseToken,now:101})) throw new Error("fence failed"); const {Database}=process.getBuiltinModule("bun:sqlite"); const db=new Database(process.env.ISPATLA_DB); db.query("INSERT INTO synthetic_effects(job_id) VALUES(?)").run(id); db.close(); console.log("SYNTHETIC_EFFECT_COMMITTED"); await new Promise(resolve=>setTimeout(resolve,30000));`;
    const child = Bun.spawn({ cmd: [process.execPath, "-e", childScript], cwd: process.cwd(), env, stdout: "pipe", stderr: "pipe" });
    let stdout = "";
    const reader = child.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        stdout += new TextDecoder().decode(value);
        if (stdout.includes("SYNTHETIC_EFFECT_COMMITTED")) break;
      }
    } finally { reader.releaseLock(); }
    expect(stdout).toContain("SYNTHETIC_EFFECT_COMMITTED");
    child.kill("SIGKILL");
    await child.exited;
    const result = run(env, `import { ensureDatabase, recoverExpiredAutomationJobs, claimAutomationJobLease, getJob } from "./src/server/db.ts"; ensureDatabase(); const recovered=recoverExpiredAutomationJobs({now:112}); const next=claimAutomationJobLease({id:${Number(id)},now:112}); const {Database}=process.getBuiltinModule("bun:sqlite"); const db=new Database(process.env.ISPATLA_DB); const effects=db.query("SELECT COUNT(*) AS count FROM synthetic_effects").get().count; db.close(); console.log(JSON.stringify({recovered,next,status:getJob(${Number(id)})?.status,effects}));`);
    expect(JSON.parse(result)).toEqual({ recovered: 1, next: null, status: "reconciliation_required", effects: 1 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
