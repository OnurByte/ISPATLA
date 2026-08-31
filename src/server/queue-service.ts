import {
  createJob,
  getAccounts,
  getDraft,
  getPost,
  getSourceRights,
  getJobs,
  updateDraft,
  updateJob,
  type AutomationJob,
  type PublicationIntent,
} from "./db";
import { runXUseJob, type XUseAction } from "./xuse";
import { automationEnabled, downloadMedia, mediaCandidate, qualityGate } from "./pipeline";
import { createIntentForDraft } from "./publication-service";

export function queueDraftIds(draftIds: number[], now = Math.floor(Date.now() / 1000)): { intents: PublicationIntent[]; jobs: AutomationJob[] } {
  const ids = [...new Set(draftIds)].filter((id) => Number.isInteger(id) && id > 0).slice(0, 100);
  if (!ids.length) throw new Error("En az bir draft seçilmeli");
  const accounts = getAccounts();
  const drafts = ids.map((id) => {
    const draft = getDraft(id);
    if (!draft) throw new Error(`draft #${id} bulunamadı`);
    if (!["post", "like", "retweet", "reply"].includes(draft.format)) throw new Error(`draft #${id}: x-use queue aksiyonu desteklenmiyor`);
    if (draft.status === "blocked") throw new Error(`draft #${id}: quality gate blokladı`);
    const post = draft.externalId ? getPost(draft.externalId) : null;
    const gateReason = draft.format === "post" ? (post ? qualityGate(post, draft.text) : null) : draft.format === "reply" && !draft.text.trim() ? "reply metni boş olamaz" : !draft.sourceUrl ? "hedef X post URL gerekli" : null;
    if (gateReason) {
      updateDraft({ id: draft.id, status: "blocked", gateReason, now });
      throw new Error(`draft #${id}: ${gateReason}`);
    }
    const account = accounts.find((item) => item.id === draft.accountId && item.enabled);
    if (!account?.xuseAccountId) throw new Error(`draft #${id}: aktif hesap veya x-use account id eşleşmesi yok`);
    return { draft, account };
  });
  const intents = drafts.filter(({ draft }) => draft.format === "post").map(({ draft, account }) => createIntentForDraft(draft.id, account.id, now));
  const jobs = drafts.filter(({ draft }) => draft.format !== "post").map(({ draft }) => {
    const job = createJob({ draftId: draft.id, accountId: draft.accountId, action: draft.format, scheduledAt: now, now });
    updateDraft({ id: draft.id, accountId: draft.accountId, status: "queued", now });
    return job;
  });
  return { intents, jobs };
}

export async function runDueAutomationJobs(now = Math.floor(Date.now() / 1000), limit = 10): Promise<Array<{ id: number; ok: boolean; reason?: string }>> {
  if (!automationEnabled()) return [];
  const due = getJobs(200)
    .filter((job) => job.status === "queued" && job.scheduledAt <= now && getAccounts().some((account) => account.id === job.accountId && account.automationMode === "auto"))
    .slice(0, Math.max(1, Math.min(50, limit)));
  const results: Array<{ id: number; ok: boolean; reason?: string }> = [];
  for (const job of due) {
    try {
      const result = await runAutomationJob(job.id);
      results.push({ id: job.id, ok: result.ok, reason: result.reason });
    } catch (error) {
      results.push({ id: job.id, ok: false, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export async function runAutomationJob(id: number): Promise<{ ok: boolean; job: AutomationJob | null; reason?: string }> {
  const job = getJobs(200).find((item) => item.id === id);
  if (!job) throw new Error("job bulunamadı");
  if (!["queued", "failed"].includes(job.status)) throw new Error("job çalıştırılamaz");
  const draft = getDraft(job.draftId);
  if (!draft?.text) throw new Error("draft metni bulunamadı");
  const account = getAccounts().find((item) => item.id === job.accountId && item.enabled);
  if (!account?.xuseAccountId) throw new Error("job hesabı aktif değil veya x-use account id eşlenmemiş");
  const action = job.action as XUseAction;
  if (!["post", "like", "retweet", "reply"].includes(action)) throw new Error("x-use MCP aksiyonu desteklenmiyor");
  const now = Math.floor(Date.now() / 1000);
  let mediaPath = "";
  const post = draft.externalId ? getPost(draft.externalId) : null;
  if (post && getSourceRights(post.sourceHandle) === "cleared") {
    const candidate = mediaCandidate(post);
    if (candidate) {
      try { mediaPath = await downloadMedia(candidate); } catch { mediaPath = ""; }
    }
  }
  updateJob({ id, status: "running", attempts: job.attempts + 1, now });
  const result = await runXUseJob({ action, account: account.xuseAccountId, targetUrl: draft.sourceUrl || undefined, text: draft.text, mediaPath: mediaPath || undefined, existingQueueId: job.xuseQueueId || undefined });
  // ponytail: x-use/search_profile is a locator hint, not a publication proof; reconciliation owns confirmation.
  const updated = updateJob({
    id,
    status: result.ok ? "executed" : "blocked",
    receipt: result.receipt,
    reason: result.reason || "x-use queue çalıştı; reconciliation bekleniyor",
    xuseQueueId: result.queueId || job.xuseQueueId,
    xuseStatus: result.xuseStatus || (result.ok ? "done" : "failed"),
    xuseCheckedAt: Math.floor(Date.now() / 1000),
    remoteUrl: result.remoteUrl || job.remoteUrl,
    reconciliationStatus: result.ok ? "not_applicable" : "failed",
    now: Math.floor(Date.now() / 1000),
  });
  return { ok: result.ok, job: updated, reason: result.reason };
}
