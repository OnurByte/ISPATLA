import type { AutomationJob, PublicationIntent } from "./db-types";
import { currentOwnerId, runAsOwner } from "./owner-context";
import { getPostgresDraft } from "./postgres-drafts";
import { getPostgresAccount } from "./postgres-accounts";
import {
  confirmPostgresAutomationJob, createPostgresQueueJob, getPostgresQueueJob, getPostgresQueueJobSystem,
  listPostgresQueueJobsSystem, markPostgresAutomationReconciliationRequired,
} from "./postgres-queue-store";
import { OfficialXClient, OfficialXError } from "./official-x";
import { withOfficialAccount } from "./publisher";
import { getPostgresXAccountAuthState } from "./postgres-x-oauth";
import { createIntentForDraft } from "./publication-service";
import {
  claimPostgresAccountDispatchLease, isPostgresAccountDispatchLeaseCurrent, isPostgresOwnerEnabled,
  publishingEnabled, recoverExpiredPostgresAutomationJobs, recoverOrphanedPostgresAutomationJobs, releasePostgresAccountDispatchLease,
  renewPostgresAccountDispatchLease,
} from "./postgres-publishing";

const PG_POLICY_BLOCK = "Yayın gönderimi kapalı: PostgreSQL politika ve değerlendirme kanıtı henüz hazır değil.";

export async function queueDraftIds(draftIds: number[], now = Math.floor(Date.now() / 1000)): Promise<{ intents: PublicationIntent[]; jobs: AutomationJob[] }> {
  const ids = [...new Set(draftIds)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 100);
  if (!ids.length) throw new Error("En az bir draft seçilmeli");
  const owner = currentOwnerId();
  if (!owner) throw new Error("Oturum gerekli");
  const rows = [];
  for (const id of ids) {
    const draft = await getPostgresDraft(id);
    const account = draft?.accountId ? await getPostgresAccount(owner, draft.accountId) : null;
    if (!draft || !account?.enabled || !(await isPostgresOwnerEnabled(owner))) throw new Error(`draft #${id}: etkin hesap gerekli`);
    if (!["post", "repost", "reply"].includes(draft.format)) throw new Error(`draft #${id}: eylem desteklenmiyor`);
    if (draft.status !== "ready") throw new Error(`draft #${id}: kalite kontrolü ve insan onayı gerekli`);
    rows.push({ draft, account });
  }
  const intents: PublicationIntent[] = [], jobs: AutomationJob[] = [];
  for (const { draft, account } of rows) {
    if (draft.format === "post") intents.push(await createIntentForDraft(draft.id, account.id, now));
    else {
      if (draft.status !== "ready") throw new Error("Eylem için önce insan onayı gerekli");
      jobs.push(await createPostgresQueueJob({ draftId: draft.id, accountId: account.id, action: draft.format, scheduledAt: now, now }));
    }
  }
  return { intents, jobs };
}

export async function runDueAutomationJobs(now = Math.floor(Date.now() / 1000), limit = 10): Promise<Array<{ id: number; ok: boolean; reason?: string }>> {
  await recoverStaleAutomationJobs(now);
  if (!(await publishingEnabled())) return [];
  const jobs = (await listPostgresQueueJobsSystem(500)).filter((job) => job.status === "queued" && job.scheduledAt <= now && job.nextAttemptAt <= now)
    .slice(0, Math.max(1, Math.min(50, limit)));
  return jobs.map((job) => ({ id: job.id, ok: false, reason: PG_POLICY_BLOCK }));
}

export async function runAutomationJob(id: number, _now = Math.floor(Date.now() / 1000), _client = new OfficialXClient()): Promise<{ ok: boolean; job: AutomationJob | null; reason?: string }> {
  if (!(await publishingEnabled())) return { ok: false, job: await getPostgresQueueJob(id), reason: "publishing is paused" };
  const job = await getPostgresQueueJob(id);
  if (!job) throw new Error("job bulunamadı");
  return { ok: false, job, reason: PG_POLICY_BLOCK };
}

export async function recoverStaleAutomationJobs(now = Math.floor(Date.now() / 1000)): Promise<number> {
  const [expired, orphaned] = await Promise.all([
    recoverExpiredPostgresAutomationJobs(now),
    recoverOrphanedPostgresAutomationJobs(now, now - 300),
  ]);
  return expired + orphaned;
}

function receiptPostId(receipt: string): string {
  try { const value = JSON.parse(receipt) as Record<string, unknown>; const id = String(value.id || value.post_id || value.postId || ""); return /^\d{1,19}$/.test(id) ? id : ""; }
  catch { return ""; }
}
function jobTargetId(sourceUrl: string): string { return sourceUrl.match(/\/status\/(\d{1,19})/)?.[1] || ""; }
function hasReplyTarget(post: Record<string, unknown>, targetId: string): boolean {
  const refs = Array.isArray(post.referenced_tweets) ? post.referenced_tweets : [];
  return refs.some((ref) => Boolean(ref) && typeof ref === "object" && (ref as Record<string, unknown>).type === "replied_to" && (ref as Record<string, unknown>).id === targetId);
}
function postMatchesJob(post: Record<string, unknown>, job: AutomationJob, text: string, xUserId: string, targetId: string): boolean {
  if (typeof post.id !== "string" || !/^\d{1,19}$/.test(post.id) || post.author_id !== xUserId || post.text !== text || typeof post.created_at !== "string") return false;
  const created = Date.parse(post.created_at);
  if (!Number.isFinite(created)) return false;
  const sent = (job.remoteWriteStartedAt ?? job.updatedAt) * 1000;
  if (created < sent - 120_000 || created > sent + 15 * 60_000) return false;
  return job.action !== "reply" || Boolean(targetId) && hasReplyTarget(post, targetId);
}

/** Reconciliation is read-only against X. It never retries a write. */
export async function reconcileAutomationJobs(limit = 20, options: { client?: OfficialXClient; now?: () => number } = {}): Promise<number> {
  const now = options.now || (() => Math.floor(Date.now() / 1000));
  await recoverStaleAutomationJobs(now());
  const caller = currentOwnerId();
  const candidates = (await listPostgresQueueJobsSystem(500)).filter((job) => ["pending_reconciliation", "reconciliation_required"].includes(job.status) && job.remoteWriteStartedAt !== null)
    .slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
  const client = options.client || new OfficialXClient();
  let confirmed = 0;
  for (const candidate of candidates) {
    const ctx = await getPostgresQueueJobSystem(candidate.id);
    const owner = ctx?.ownerUserId;
    if (!ctx || !owner || caller && caller !== owner || !(await isPostgresOwnerEnabled(owner))) continue;
    const account = await getPostgresAccount(owner, candidate.accountId || 0);
    if (!account?.enabled) continue;
    const accountLease = await claimPostgresAccountDispatchLease({ accountId: account.id, ownerUserId: owner, now: now(), leaseSeconds: 120 });
    if (!accountLease) continue;
    let healthy = true;
    const heartbeat = setInterval(() => {
      void renewPostgresAccountDispatchLease({ ...accountLease, ownerUserId: owner, now: now(), leaseSeconds: 120 })
        .then((ok) => { healthy = healthy && ok; }).catch(() => { healthy = false; });
    }, 15_000);
    try {
      const result = await runAsOwner(owner, async () => {
        if (!healthy || !(await isPostgresOwnerEnabled(owner)) || !(await isPostgresAccountDispatchLeaseCurrent({ ...accountLease, ownerUserId: owner, now: now() }))) return false;
        const latest = await getPostgresQueueJob(candidate.id);
        if (!latest || !["pending_reconciliation", "reconciliation_required"].includes(latest.status) || latest.remoteWriteStartedAt === null) return false;
        const draft = await getPostgresDraft(latest.draftId);
        if (!draft) return false;
        return withOfficialAccount(account, async (credential) => {
          if (!credential.scopes.includes("tweet.read")) return false;
          if (latest.action === "repost") {
            const targetId = jobTargetId(draft.sourceUrl);
            if (!targetId) {
              await markPostgresAutomationReconciliationRequired({ id: latest.id, ownerUserId: owner, now: now(), reason: "repost target missing; manual reconciliation required" });
              return false;
            }
            const lookup = await client.getRepostedBy(credential, targetId, 3);
            if (lookup.userIds.includes(credential.xUserId)) {
              const url = `https://x.com/${account.handle}/status/${targetId}`;
              return confirmPostgresAutomationJob({ id: latest.id, ownerUserId: owner, now: now(), receipt: latest.receipt || JSON.stringify({ targetId, reposted: true }), remoteUrl: url });
            }
            if (lookup.complete) await markPostgresAutomationReconciliationRequired({ id: latest.id, ownerUserId: owner, now: now(), reason: "official repost lookup did not confirm this account; manual reconciliation required" });
            return false;
          }
          if (latest.action !== "post" && latest.action !== "reply") {
            await markPostgresAutomationReconciliationRequired({ id: latest.id, ownerUserId: owner, now: now(), reason: "unsupported action requires manual reconciliation" });
            return false;
          }
          const targetId = latest.action === "reply" ? jobTargetId(draft.sourceUrl) : "";
          if (latest.action === "reply" && !targetId) {
            await markPostgresAutomationReconciliationRequired({ id: latest.id, ownerUserId: owner, now: now(), reason: "reply target missing; manual reconciliation required" });
            return false;
          }
          const id = receiptPostId(latest.receipt);
          const post = id ? await client.getPost(credential, id) : null;
          if (!post || !postMatchesJob(post, latest, draft.text, credential.xUserId, targetId)) {
            await markPostgresAutomationReconciliationRequired({ id: latest.id, ownerUserId: owner, now: now(), reason: id ? "exact receipt lookup did not confirm this account; manual reconciliation required" : "post receipt missing; manual reconciliation required" });
            return false;
          }
          const postId = String(post.id), url = `https://x.com/${account.handle}/status/${postId}`;
          return confirmPostgresAutomationJob({ id: latest.id, ownerUserId: owner, now: now(), receipt: latest.receipt || JSON.stringify({ id: postId, text: draft.text }), remoteUrl: url });
        });
      });
      if (result) confirmed++;
    } catch (error) {
      if (error instanceof OfficialXError && error.code === "reauth") {
        // Keep the unresolved remote state fenced for a later reconciliation pass.
      }
    } finally {
      clearInterval(heartbeat);
      await releasePostgresAccountDispatchLease({ ...accountLease, ownerUserId: owner, now: now() });
    }
  }
  return confirmed;
}

export async function getSystemQueueSnapshot(): Promise<AutomationJob[]> { return listPostgresQueueJobsSystem(); }
