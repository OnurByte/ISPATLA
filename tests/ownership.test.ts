import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("owner contexts isolate accounts, drafts, batches, jobs, intents, secrets, settings and analytics", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-ownership-"));
  const database = join(directory, "state.sqlite3");
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import { runAsOwner } from "./src/server/owner-context.ts";
        import { claimAutomationJob, claimPublicationIntentDispatch, createDraft, createDraftBatch, createJob, createPublicationIntent, deleteAccount, deleteDraft, ensureDatabase, getAccountCategoryConfigs, getAccountVoiceProfile, getAccounts, getAnalytics, getDraft, getDraftBatch, getDrafts, getJob, getJobs, getPendingPublicationIntents, getPost, getPublicationIntent, getSecretCiphertext, getSecretMetas, getSetting, getSummary, getUsageSummary, markDraft, recordAccountMetric, recordAccountSubscriptionSync, recordPublishAttempt, recordUsageEvent, saveAccount, saveAccountVoiceProfile, saveSecretCiphertext, setSetting, updateDraft, updateDraftBatch, updateJob, updatePublicationIntent, upsertPost } from "./src/server/db.ts";
        if (!ensureDatabase()) throw new Error("database did not initialize");
        upsertPost({ externalId: "public-post", sourceHandle: "source", authorHandle: "source", statusUrl: "https://x.com/source/status/1", text: "shared post", createdTimestamp: 1, likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, mediaCount: 0, mediaJson: "[]", rawJson: "{}", score: 70, scoreReason: "source", sensitive: false, clusterKey: "cluster" }, 1);
        const account = runAsOwner("user-a", () => saveAccount({ accountKey: "a", handle: "alice", displayName: "Alice", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"], now: 1 }));
        const batch = runAsOwner("user-a", () => createDraftBatch({ prompt: "secret prompt", format: "post", variantMode: "per_account", accountIds: [account.id], provider: "api", model: "m", now: 2 }));
        const draft = runAsOwner("user-a", () => createDraft({ batchId: batch.id, externalId: "public-post", accountId: account.id, format: "post", text: "private draft", now: 3 }));
        const accountlessDraft = runAsOwner("user-a", () => createDraft({ externalId: "", format: "post", text: "accountless private draft", now: 3 }));
        const job = runAsOwner("user-a", () => createJob({ draftId: draft.id, accountId: account.id, action: "post", scheduledAt: 4, now: 3 }));
        const intent = runAsOwner("user-a", () => createPublicationIntent({ draftId: draft.id, accountId: account.id, idempotencyKey: "private-key", text: "private draft", now: 3 }));
        runAsOwner("user-a", () => { recordAccountMetric({ accountId: account.id, followers: 50, following: 10, statuses: 100, likes: 3, mediaCount: 2, now: 4 }); recordAccountSubscriptionSync({ accountId: account.id, tier: "premium", observedAt: 4 }); saveAccountVoiceProfile(account.id, { sampleCount: 1 }, 4); });
        runAsOwner("user-a", () => recordPublishAttempt({ externalId: "public-post", accountId: account.id, status: "blocked", reason: "private account attempt", receipt: "", now: 5 }));
        runAsOwner("user-a", () => { markDraft("public-post", "private draft", "draft"); saveSecretCiphertext("x_token", "x", "cipher-a", 4); setSetting("ai_provider", "user-a-provider", 4); recordUsageEvent({ kind: "completion", provider: "api", model: "m", units: 3, now: 4 }); });
        const before = runAsOwner("user-b", () => ({ accounts: getAccounts(), drafts: getDrafts(), draft: getDraft(draft.id), accountlessDraft: getDraft(accountlessDraft.id), batch: getDraftBatch(batch.id), jobs: getJobs(), job: getJob(job.id), intent: getPublicationIntent(intent.id), pending: getPendingPublicationIntents(), secret: getSecretCiphertext("x_token"), metas: getSecretMetas((name) => name), setting: getSetting("ai_provider", "fallback"), analyticsDrafts: getAnalytics().drafts, usageEvents: getUsageSummary().events, summaryBlocked: getSummary(0).publishBlocked, postDraftText: getPost("public-post")?.draftText, postDraftStatus: getPost("public-post")?.draftStatus }));
        const writes = runAsOwner("user-b", () => ({ update: updateDraft({ id: draft.id, text: "intrusion", now: 5 }), delete: deleteDraft(draft.id), batch: updateDraftBatch(batch.id, "cancelled", 5), jobClaim: claimAutomationJob(job.id, 10), jobUpdate: updateJob({ id: job.id, status: "cancelled", now: 5 }), intentClaim: claimPublicationIntentDispatch(intent.id, 5), intentUpdate: updatePublicationIntent({ id: intent.id, status: "cancelled", now: 5 }), createJob: (() => { try { createJob({ draftId: draft.id, accountId: account.id, action: "post", scheduledAt: 5, now: 5 }); return "allowed"; } catch (error) { return String(error); } })(), recordMetric: (() => { try { recordAccountMetric({ accountId: account.id, followers: 999, following: 0, statuses: 0, likes: 0, mediaCount: 0, now: 5 }); return "allowed"; } catch (error) { return String(error); } })(), saveVoice: saveAccountVoiceProfile(account.id, { sampleCount: 99 }, 5), getVoice: getAccountVoiceProfile(account.id), saveAccount: (() => { try { saveAccount({ id: account.id, accountKey: "taken", handle: "taken", displayName: "Taken", enabled: true, defaultAccount: true, automationMode: "auto", dailyLimit: 24, capabilities: [], now: 5 }); return "allowed"; } catch (error) { return String(error); } })(), deleteAccount: (() => { try { deleteAccount(account.id); return "allowed"; } catch (error) { return String(error); } })(), accountConfig: (() => { try { getAccountCategoryConfigs(account.id); return "allowed"; } catch (error) { return String(error); } })() }));
        const after = runAsOwner("user-a", () => ({ draft: getDraft(draft.id)?.text, batch: getDraftBatch(batch.id)?.status, secret: getSecretCiphertext("x_token")?.ciphertext, setting: getSetting("ai_provider") }));
        console.log(JSON.stringify({ before, writes, after }));
      `],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: database },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output.before).toEqual({ accounts: [], drafts: [], draft: null, accountlessDraft: null, batch: null, jobs: [], job: null, intent: null, pending: [], secret: null, metas: [], setting: "fallback", analyticsDrafts: 0, usageEvents: 0, summaryBlocked: 0, postDraftText: "", postDraftStatus: "not_started" });
    expect(output.writes.update).toBeNull();
    expect(output.writes.delete).toBe(false);
    expect(output.writes.batch).toBeNull();
    expect(output.writes.jobClaim).toBeNull();
    expect(output.writes.jobUpdate).toBeNull();
    expect(output.writes.intentClaim).toBeNull();
    expect(output.writes.intentUpdate).toBeNull();
    expect(output.writes.createJob).toContain("draft not found");
    expect(output.writes.recordMetric).toContain("account not found");
    expect(output.writes.saveVoice).toBeNull();
    expect(output.writes.getVoice).toBeNull();
    expect(output.writes.saveAccount).toContain("account not found");
    expect(output.writes.deleteAccount).toContain("account not found");
    expect(output.writes.accountConfig).toContain("account not found");
    expect(output.after).toEqual({ draft: "private draft", batch: "draft", secret: "cipher-a", setting: "user-a-provider" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
