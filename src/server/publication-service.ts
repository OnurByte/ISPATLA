import { createHash } from "node:crypto";
import {
  createPublicationIntent,
  claimMonitorRun,
  confirmPublicationIntentAttempt,
  finishBudgetRun,
  getAccounts,
  getDraft,
  getPublicationIntent,
  getPublicationIntents,
  getPost,
  getSourceRights,
  recordPublishAttempt,
  syncIntentPublication,
  updateDraft,
  updatePublicationIntent,
  type PublicationIntent,
} from "./db";
import { publish } from "./publisher";
import { FxTwitterReader } from "./x-reader";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function publicationIdempotencyKey(input: { draftId: number; accountId: number; text: string; mediaHash: string }): string {
  return sha256(`${input.draftId}\0${input.accountId}\0${input.text}\0${input.mediaHash}`);
}

export function createIntentForDraft(draftId: number, accountId?: number | null, now = Math.floor(Date.now() / 1000)): PublicationIntent {
  const draft = getDraft(draftId);
  if (!draft) throw new Error(`draft #${draftId} bulunamadı`);
  const resolvedAccountId = accountId ?? draft.accountId;
  const account = getAccounts().find((item) => item.id === resolvedAccountId && item.enabled);
  if (!account?.xuseAccountId) throw new Error(`draft #${draftId}: aktif hesap veya x-use account id eşleşmesi yok`);
  if (draft.format !== "post") throw new Error(`draft #${draftId}: PublicationIntent yalnız post içindir`);
  if (!draft.text.trim()) throw new Error(`draft #${draftId}: post metni boş olamaz`);
  const sourcePost = draft.externalId ? getPost(draft.externalId) : null;
  const mediaHash = sourcePost && getSourceRights(sourcePost.sourceHandle) === "cleared" ? sha256(sourcePost.mediaJson) : "";
  const intent = createPublicationIntent({
    draftId,
    accountId: account.id,
    text: draft.text,
    mediaHash,
    idempotencyKey: publicationIdempotencyKey({ draftId, accountId: account.id, text: draft.text, mediaHash }),
    now,
  });
  updateDraft({ id: draft.id, accountId: account.id, status: "pending_approval", now });
  return intent;
}

export function approvePublicationIntent(id: number, now = Math.floor(Date.now() / 1000)): PublicationIntent {
  const intent = getPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (intent.status === "approved") return intent;
  if (intent.status !== "pending_approval") throw new Error(`publication intent ${intent.status} durumunda onaylanamaz`);
  return updatePublicationIntent({ id, status: "approved", approvedAt: now, now })!;
}

export function cancelPublicationIntent(id: number, now = Math.floor(Date.now() / 1000)): PublicationIntent {
  const intent = getPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (intent.status === "cancelled") return intent;
  if (!["pending_approval", "approved", "blocked"].includes(intent.status)) throw new Error(`publication intent ${intent.status} durumunda iptal edilemez`);
  updateDraft({ id: intent.draftId, status: "draft", now });
  return updatePublicationIntent({ id, status: "cancelled", reason: "kullanıcı iptal etti", now })!;
}

export async function dispatchPublicationIntent(id: number): Promise<PublicationIntent> {
  const intent = getPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (!["approved", "blocked"].includes(intent.status)) throw new Error(`publication intent ${intent.status} durumunda gönderilemez`);
  const draft = getDraft(intent.draftId);
  const account = getAccounts().find((item) => item.id === intent.accountId && item.enabled);
  if (!draft || !account?.xuseAccountId) throw new Error("publication intent draft/hesap eşleşmesi geçersiz");
  const now = Math.floor(Date.now() / 1000);
  updatePublicationIntent({ id, status: "dispatching", dispatchedAt: now, now });
  let mediaPath = "";
  const sourcePost = draft.externalId ? getPost(draft.externalId) : null;
  if (sourcePost && getSourceRights(sourcePost.sourceHandle) === "cleared") {
    const { downloadMedia, mediaCandidate, qualityGate } = await import("./pipeline");
    const gateReason = qualityGate(sourcePost, intent.text);
    if (gateReason) return updatePublicationIntent({ id, status: "blocked", reason: gateReason, now: Math.floor(Date.now() / 1000) })!;
    const candidate = mediaCandidate(sourcePost);
    if (candidate) {
      try { mediaPath = await downloadMedia(candidate); } catch { mediaPath = ""; }
    }
  }
  const result = await publish({ account, text: intent.text, mediaPath: mediaPath || undefined, existingQueueId: intent.xuseQueueId || undefined });
  const finishedAt = Math.floor(Date.now() / 1000);
  if (!result.ok) return updatePublicationIntent({
    id, status: "blocked", reason: result.reason || "x-use publish başarısız", receipt: result.receipt,
    xuseQueueId: result.queueId || intent.xuseQueueId, remoteUrl: result.remoteUrl || intent.remoteUrl, now: finishedAt,
  })!;
  const updated = updatePublicationIntent({
    id, status: "pending_reconciliation", reason: "x-use yazmayı kabul etti; FxTwitter reconciliation bekleniyor",
    receipt: result.receipt, xuseQueueId: result.queueId || intent.xuseQueueId, remoteUrl: result.remoteUrl || intent.remoteUrl, now: finishedAt,
  })!;
  updateDraft({ id: draft.id, status: "pending_reconciliation", now: finishedAt });
  recordPublishAttempt({
    externalId: draft.externalId || `intent:${intent.id}`, accountId: account.id, status: "pending_reconciliation",
    reason: updated.reason, receipt: result.receipt, remoteUrl: result.remoteUrl, now: finishedAt,
  });
  return updated;
}

export async function runApprovedPublicationIntents(limit = 10): Promise<Array<{ id: number; ok: boolean; reason?: string }>> {
  const results: Array<{ id: number; ok: boolean; reason?: string }> = [];
  for (const intent of getPublicationIntents({ status: "approved", limit: Math.max(1, Math.min(50, limit)) })) {
    try {
      const result = await dispatchPublicationIntent(intent.id);
      results.push({ id: intent.id, ok: result.status === "pending_reconciliation", reason: result.reason });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      updatePublicationIntent({ id: intent.id, status: "blocked", reason, now: Math.floor(Date.now() / 1000) });
      results.push({ id: intent.id, ok: false, reason });
    }
  }
  return results;
}

function remoteId(intent: PublicationIntent): string {
  const fromUrl = intent.remoteUrl.match(/\/status\/(\d+)/)?.[1];
  if (fromUrl) return fromUrl;
  try {
    const value = JSON.parse(intent.receipt) as Record<string, unknown>;
    const id = String(value.id || value.post_id || value.postId || "");
    return /^\d+$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

function istanbulDayKey(now: number): string {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now * 1000).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function reconcilePublicationIntents(limit = 20): Promise<number> {
  const reader = new FxTwitterReader();
  let confirmed = 0;
  for (const intent of getPublicationIntents({ status: "pending_reconciliation", limit })) {
    const id = remoteId(intent);
    if (!id) {
      updatePublicationIntent({ id: intent.id, status: "reconciliation_required", reason: "remote post id bulunamadı; kör retry yapılmadı", now: Math.floor(Date.now() / 1000) });
      continue;
    }
    const now = Math.floor(Date.now() / 1000);
    const runId = claimMonitorRun({ targetId: null, dayKey: istanbulDayKey(now), bucket: "reconciliation", now });
    if (!runId) break;
    try {
      const post = await reader.fetchPostMetrics({ externalId: id });
      const account = getAccounts().find((item) => item.id === intent.accountId);
      if (!account || post.text !== intent.text || post.author.handle !== account.handle.toLowerCase()) {
        finishBudgetRun(runId, "success", now);
        continue;
      }
      updatePublicationIntent({ id: intent.id, status: "confirmed", confirmedAt: now, remoteUrl: post.url, now });
      updateDraft({ id: intent.draftId, status: "confirmed", now });
      confirmPublicationIntentAttempt(intent.id, now);
      syncIntentPublication(intent.id, now);
      finishBudgetRun(runId, "success", now);
      confirmed += 1;
    } catch (error) {
      finishBudgetRun(runId, "failed", Math.floor(Date.now() / 1000), error instanceof Error ? error.message : String(error));
      // Ambiguous remote state stays pending; never blind-retry a write.
    }
  }
  return confirmed;
}
