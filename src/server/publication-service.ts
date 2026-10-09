import { createHash } from "node:crypto";
import {
  createPublicationIntent,
  createPublicationApproval,
  claimMonitorRun,
  claimPublicationIntentLease,
  claimAccountDispatchLease,
  renewAccountDispatchLease,
  releaseAccountDispatchLease,
  readPublicationPolicyHistory,
  confirmPublicationIntentAttempt,
  confirmPublicationIntentRemote,
  finishPublicationIntentLease,
  finishBudgetRun,
  getAccounts,
  isOwnerEnabled,
  getApprovalSnapshotSource,
  getAccountCategoryConfigs,
  getDraft,
  getPublicationIntent,
  getPublicationIntents,
  getPost,
  getSourceRights,
  recordPublishAttempt,
  recoverStalePublicationIntent,
  recoverExpiredPublicationIntents,
  markPublicationIntentRequestSent,
  renewPublicationIntentLease,
  syncIntentPublication,
  updateDraft,
  updatePublicationIntent,
  type PublicationIntent,
} from "./db";
import { OfficialXPublisher, withOfficialAccount } from "./publisher";
import { getXAccountAuthState, markXAccountReauthorizationRequired } from "./x-oauth-store";
import { getEffectivePolicyKills } from "./policy-store";
import { decideXPolicy } from "./x-policy";
import { currentOwnerId, runAsOwner } from "./owner-context";
import { OfficialXClient, OfficialXError } from "./official-x";
import { authorizeAutomaticSend, demoteAutomaticExecution } from "./autonomy/execution";
import { confirmedAutonomyAuthorization } from "./evaluation-store";

const STALE_DISPATCH_SECONDS = 5 * 60;

function demoteAutomaticSafely(input: { draftId: number; accountId: number; action: "post" | "repost" | "reply"; reason: "policy_failure" | "auth_uncertainty" | "duplicate_risk" | "unacceptable_outcome"; now: number }): void {
  try { demoteAutomaticExecution(input); } catch { /* Missing scope evidence already keeps dispatch blocked. */ }
}

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
  if (!account) throw new Error(`draft #${draftId}: aktif hesap eşleşmesi yok`);
  if (draft.format !== "post") throw new Error(`draft #${draftId}: PublicationIntent yalnız post içindir`);
  if (!draft.text.trim()) throw new Error(`draft #${draftId}: post metni boş olamaz`);
  const sourcePost = draft.externalId ? getPost(draft.externalId) : null;
  const mediaHash = sourcePost && getSourceRights(sourcePost.sourceHandle) === "cleared" ? sha256(sourcePost.mediaJson) : "";
  updateDraft({ id: draft.id, accountId: account.id, status: "pending_approval", now });
  const intent = createPublicationIntent({
    draftId,
    accountId: account.id,
    text: draft.text,
    mediaHash,
    idempotencyKey: publicationIdempotencyKey({ draftId, accountId: account.id, text: draft.text, mediaHash }),
    now,
  });
  updateDraft({ id: draft.id, status: "pending_approval", now });
  return intent;
}

export function approvePublicationIntent(id: number, now = Math.floor(Date.now() / 1000), options: { approvalSource?: "human" | "automatic" } = {}): PublicationIntent {
  const intent = getPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (intent.status === "approved" && intent.approvalExpiresAt !== null && intent.approvalExpiresAt > now) return intent;
  if (intent.status === "approved" && intent.approvalExpiresAt !== null && intent.approvalExpiresAt <= now) {
    updatePublicationIntent({ id, status: "expired", reason: "approval_expired_requires_new_intent", now });
    throw new Error("publication approval expired; create a new approval");
  }
  if (intent.status !== "pending_approval") throw new Error(`publication intent ${intent.status} durumunda onaylanamaz`);
  return createPublicationApproval({ id, now, source: options.approvalSource })!;
}

export function cancelPublicationIntent(id: number, now = Math.floor(Date.now() / 1000)): PublicationIntent {
  const intent = getPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (intent.status === "cancelled") return intent;
  if (!["pending_approval", "approved", "blocked"].includes(intent.status)) throw new Error(`publication intent ${intent.status} durumunda iptal edilemez`);
  updateDraft({ id: intent.draftId, status: "draft", now });
  return updatePublicationIntent({ id, status: "cancelled", reason: "kullanıcı iptal etti", now })!;
}

export type DispatchPublicationOptions = { publisher?: OfficialXPublisher; now?: () => number; beforeSend?: () => void | Promise<void> };

export async function dispatchPublicationIntent(id: number, options: DispatchPublicationOptions = {}): Promise<PublicationIntent> {
  if (!(await import("./pipeline")).publishingEnabled()) throw new Error("publishing is paused");
  const callerOwner = currentOwnerId();
  const unscopedIntent = getPublicationIntent(id);
  if (!unscopedIntent) throw new Error("publication intent bulunamadı");
  const persistedAccount = getAccounts().find((item) => item.id === unscopedIntent.accountId);
  const ownerUserId = persistedAccount?.ownerUserId;
  if (!ownerUserId || (callerOwner && callerOwner !== ownerUserId)) throw new Error("publication intent owner context mismatch");
  if (!isOwnerEnabled(ownerUserId)) throw new Error("publication intent owner is disabled");
  return runAsOwner(ownerUserId, () => dispatchPublicationIntentAsOwner(id, ownerUserId, options));
}

async function dispatchPublicationIntentAsOwner(id: number, ownerUserId: string, options: DispatchPublicationOptions): Promise<PublicationIntent> {
  const now = options.now || (() => Math.floor(Date.now() / 1000));
  const intent = getPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (!isOwnerEnabled(ownerUserId)) throw new Error("publication intent owner is disabled");
  if (!(await import("./pipeline")).publishingEnabled()) throw new Error("publishing is paused");
  if (intent.status !== "approved") throw new Error(`publication intent ${intent.status} durumunda gönderilemez`);
  const draft = getDraft(intent.draftId);
  const account = getAccounts().find((item) => item.id === intent.accountId && item.enabled && item.ownerUserId === ownerUserId);
  if (!draft || !account) throw new Error("publication intent draft/hesap eşleşmesi geçersiz");
  const sourcePost = draft.externalId ? getPost(draft.externalId) : null;
  const approvalSource = getApprovalSnapshotSource("publication_intent", id);
  let gateReason = "";
  if (sourcePost) {
    const { qualityGate } = await import("./pipeline");
    gateReason = qualityGate(sourcePost, intent.text) || "";
  }

  const authState = getXAccountAuthState(account.id, ownerUserId);
  const consent = authState?.consents.find((item) => item.action === "post") || null;
  const policyCategory = getAccountCategoryConfigs().filter(row => row.accountId === account.id && row.enabled).sort((a,b)=>Number(b.primary)-Number(a.primary)||b.priority-a.priority)[0]?.categorySlug;
  const mode = consent?.mode === "auto" ? "auto" : consent?.mode === "assist" ? "assist" : "observe";
  if (gateReason) {
    if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "unacceptable_outcome", now: now() });
    return updatePublicationIntent({ id, status: "blocked", reason: gateReason, now: now() })!;
  }
  if (!authState?.connected || !consent || mode === "observe" || (mode === "auto" && consent.revokedAt !== null)) {
    if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "auth_uncertainty", now: now() });
    return updatePublicationIntent({ id, status: "blocked", reason: "current 𝕏 connection and Assist/Auto post consent are required", now: now() })!;
  }

  const currentMediaHash = sourcePost && getSourceRights(sourcePost.sourceHandle) === "cleared" ? sha256(sourcePost.mediaJson) : "";
  if (currentMediaHash !== intent.mediaHash) {
    if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "unacceptable_outcome", now: now() });
    return updatePublicationIntent({ id, status: "blocked", reason: "source or media changed; create a new approval", now: now() })!;
  }

  let mediaPath = "";
  if (sourcePost && getSourceRights(sourcePost.sourceHandle) === "cleared") {
    const { downloadMedia, mediaCandidate } = await import("./pipeline");
    const candidate = mediaCandidate(sourcePost);
    if (candidate) {
      try { mediaPath = await downloadMedia(candidate); } catch {
        return updatePublicationIntent({ id, status: "blocked", reason: "cleared source media could not be prepared; post was not sent", now: now() })!;
      }
    }
  }

  const accountLease = claimAccountDispatchLease({ accountId: account.id, now: now(), leaseSeconds: 120 });
  if (!accountLease) throw new Error("account dispatch lease unavailable");
  let accountLeaseHealthy = true;
  let activeIntentLease: { id: number; leaseToken: string } | null = null;
  const heartbeat = setInterval(() => {
    try {
      accountLeaseHealthy = accountLeaseHealthy && renewAccountDispatchLease({ accountId: account.id, leaseToken: accountLease.leaseToken, now: now(), leaseSeconds: 120 });
      if (activeIntentLease) {
        const renewed = renewPublicationIntentLease({ ...activeIntentLease, now: now(), leaseSeconds: 120 });
        accountLeaseHealthy = accountLeaseHealthy && renewed;
      }
    } catch { accountLeaseHealthy = false; }
  }, 20_000);
  try { return await withOfficialAccount(account, async (credential) => {
    if (!(await import("./pipeline")).publishingEnabled()) throw new Error("publishing is paused");
    const client = options.publisher || new OfficialXPublisher();
    const caps = client.capabilities(credential.scopes);
    const makeDecision = (currentConsent: NonNullable<typeof consent>, connected: boolean) => {
      const currentMode = currentConsent.mode === "auto" ? "auto" : currentConsent.mode === "assist" ? "assist" : "observe";
      return decideXPolicy({
      kills: getEffectivePolicyKills({accountId:account.id,category:policyCategory,action:"post"}),
      action: "post", automatic: currentMode === "auto", mode: currentMode, accountId: account.id, now: now(), text: intent.text,
      sourceText: sourcePost?.text, sourceHandle: sourcePost?.sourceHandle, grantConnected: connected,
      capabilities: [ ...(caps.post ? ["post"] : []) ], humanApproved: approvalSource === "human",
      consent: {
        action: "post", mode: currentConsent.mode, policyVersion: currentConsent.policyVersion, copyVersion: currentConsent.copyVersion,
        grantedAt: currentConsent.grantedAt, revokedAt: currentConsent.revokedAt, dailyLimit: currentConsent.dailyLimit, cadenceSeconds: currentConsent.cadenceSeconds,
      },
      history: readPublicationPolicyHistory({ excludeIntentId: id, since: now() - 86400 }).map((row) => ({
        accountId: row.accountId, action: row.action, text: row.text,
        ...(row.clusterId === null ? {} : { clusterId: String(row.clusterId) }),
        sourceHandle: row.sourceHandle || undefined, targetId: row.targetId || undefined,
        publishedAt: row.publishedAt ?? (row.potentialBudgetUsed ? row.sendStartedAt ?? row.updatedAt : 0),
      })),
      mediaRightsCleared: !mediaPath || getSourceRights(sourcePost?.sourceHandle || "") === "cleared",
      trigger: currentMode === "auto" ? (sourcePost ? "event" : "manual") : "manual",
    }); };
    const decision = makeDecision(consent, authState.connected);
    if (!decision.allowed) {
      if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: decision.reasons.some(reason => reason.toLowerCase().includes("duplicate")) ? "duplicate_risk" : "policy_failure", now: now() });
      return updatePublicationIntent({ id, status: "blocked", reason: `policy_blocked:${decision.reasons.join(",")}`, now: now() })!;
    }

    const lease = claimPublicationIntentLease({ id, now: now(), leaseSeconds: 120 });
    if (!lease) throw new Error("publication intent lease unavailable");
    const leaseInput = { id, leaseToken: lease.leaseToken };
    activeIntentLease = leaseInput;
    let marked = false;
    try {
      if (!(await import("./pipeline")).publishingEnabled()) {
        finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "retryable_failure", reason: "publishing is paused", now: now(), retryAfterSeconds: 60 });
        throw new Error("publishing is paused");
      }
      await options.beforeSend?.();
      const latestAuth = getXAccountAuthState(account.id, ownerUserId);
      const latestConsent = latestAuth?.consents.find((item) => item.action === "post");
      if (!accountLeaseHealthy || !renewAccountDispatchLease({ accountId: account.id, leaseToken: accountLease.leaseToken, now: now(), leaseSeconds: 120 }
        ) || !latestAuth?.connected || latestAuth.xUserId !== credential.xUserId || !latestConsent
        || !["assist", "auto"].includes(latestConsent.mode) || (latestConsent.mode === "auto" && latestConsent.revokedAt !== null)
        || latestConsent.version !== consent.version || latestConsent.policyVersion !== consent.policyVersion
        || latestConsent.copyVersion !== consent.copyVersion) {
        if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "auth_uncertainty", now: now() });
        return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "permanent_failure", reason: "connection or post consent was revoked before send", errorClass: "reauth", now: now() }) || getPublicationIntent(id)!;
      }
      const finalDecision = makeDecision(latestConsent, latestAuth.connected);
      if (!finalDecision.allowed) {
        if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: finalDecision.reasons.some(reason => reason.toLowerCase().includes("duplicate")) ? "duplicate_risk" : "policy_failure", now: now() });
        return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken,
        outcome: "permanent_failure", reason: `policy_blocked:${finalDecision.reasons.join(",")}`, errorClass: "policy_blocked", now: now() }) || getPublicationIntent(id)!;
      }
      const latestSourcePost = draft.externalId ? getPost(draft.externalId) : null;
      const latestMediaHash = latestSourcePost && getSourceRights(latestSourcePost.sourceHandle) === "cleared" ? sha256(latestSourcePost.mediaJson) : "";
      if (latestMediaHash !== intent.mediaHash) {
        if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "unacceptable_outcome", now: now() });
        return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "permanent_failure",
          errorClass: "approval_changed", reason: "source or media changed; create a new approval", now: now() }) || getPublicationIntent(id)!;
      }
      let autonomyEvidenceHash: string | undefined;
      let autonomyModelKey: string | undefined;
      let autonomySelectorVersion: string | undefined;
      let autonomyCategory: string | undefined;
      if (mode === "auto") {
        try {
          authorizeAutomaticSend({ draftId: draft.id, accountId: account.id, action: "post" });
          autonomyCategory = draft.evaluation?.categorySlug;
          const authorization = autonomyCategory ? confirmedAutonomyAuthorization({accountId:String(account.id),action:"post",category:autonomyCategory,riskTier:"low"}) : null;
          autonomyEvidenceHash = authorization?.evidenceHash;
          autonomyModelKey = authorization?.modelKey;
          autonomySelectorVersion = authorization?.selectorVersion;
          if (!autonomyEvidenceHash || !autonomyModelKey || !autonomySelectorVersion) throw new Error("confirmed autonomy scope is unavailable");
        }
        catch {
          demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "policy_failure", now: now() });
          return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "permanent_failure",
            errorClass: "autonomy_unavailable", reason: "confirmed earned autonomy is required", now: now() }) || getPublicationIntent(id)!;
        }
      }
      if (!isOwnerEnabled(ownerUserId)) throw new Error("publication intent owner is disabled");
      if (!renewPublicationIntentLease({ ...leaseInput, now: now(), leaseSeconds: 120 })) throw new Error("publication lease expired before send");
      if (!markPublicationIntentRequestSent({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, now: now(), authorization: {
        ownerUserId, mode: latestConsent.mode as "assist" | "auto", consentVersion: latestConsent.version,
        policyVersion: latestConsent.policyVersion, copyVersion: latestConsent.copyVersion,
        xUserId: credential.xUserId, credentialVersion: credential.version,
        ...(mode === "auto" ? { category: autonomyCategory!, autonomyEvidenceHash: autonomyEvidenceHash!, autonomyModelKey: autonomyModelKey!, autonomySelectorVersion: autonomySelectorVersion! } : {}),
      } })) throw new Error("publication write already started or lease expired");
      marked = true;

      const result = await client.publishPost({ account, credentials: { accessToken: credential.accessToken, xUserId: credential.xUserId }, text: intent.text, mediaPath: mediaPath || undefined });
        const finishedAt = now();
        const updated = finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "accepted", reason: "official 𝕏 accepted the post; reconciliation pending",
          receipt: JSON.stringify({ id: result.id, text: result.text }), remotePostId: result.id, remoteUrl: `https://x.com/${account.handle}/status/${result.id}`, now: finishedAt });
        if (!updated) throw new Error("publication lease expired after remote acceptance; reconcile before retry");
        updateDraft({ id: draft.id, status: "pending_reconciliation", now: finishedAt });
        recordPublishAttempt({ externalId: draft.externalId || `intent:${intent.id}`, accountId: account.id,
          publicationIntentId: intent.id, status: "pending_reconciliation", reason: updated.reason, receipt: updated.receipt,
          remoteUrl: updated.remoteUrl, now: finishedAt });
      return updated;
    } catch (error) {
      if (marked) {
        const finishedAt = now();
        if (error instanceof OfficialXError && error.code === "rate_limited") {
          const seconds = retryAfterSeconds(error.retryAfter, error.rateLimitReset, finishedAt);
          return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "retryable_failure", errorClass: "rate_limited", retryAfterSeconds: seconds,
            reason: "𝕏 rate limited before accepting the post", now: finishedAt }) || getPublicationIntent(id)!;
        }
        if (error instanceof OfficialXError && error.code === "reauth") {
          try { markXAccountReauthorizationRequired(account.id, ownerUserId); } catch { /* Intent still remains fenced if auth-state persistence fails. */ }
          if (mode === "auto") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "auth_uncertainty", now: finishedAt });
          return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "permanent_failure", errorClass: "reauth",
            reason: "𝕏 reauthorization required; no blind retry", now: finishedAt }) || getPublicationIntent(id)!;
        }
        if (mode === "auto" && error instanceof OfficialXError && error.code === "unknown_remote_state") demoteAutomaticSafely({ draftId: draft.id, accountId: account.id, action: "post", reason: "duplicate_risk", now: finishedAt });
        if (error instanceof OfficialXError && ["capability", "remote_validation", "invalid_media", "policy_blocked"].includes(error.code)) {
          return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "permanent_failure", errorClass: error.code,
            reason: error.code === "reauth" ? "𝕏 reauthorization required; no blind retry" : error.message, now: finishedAt }) || getPublicationIntent(id)!;
        }
        return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "unknown_remote_state", errorClass: "unknown_remote_state",
          reason: "remote write result is ambiguous; reconcile before retry", now: finishedAt }) || getPublicationIntent(id)!;
      }
      const current = getPublicationIntent(id);
      if (current?.status === "dispatching" && current.leaseToken === lease.leaseToken) {
        return finishPublicationIntentLease({ ...leaseInput, accountLeaseToken: accountLease.leaseToken, outcome: "retryable_failure", errorClass: "pre_write_failure",
          reason: "dispatch failed before the once-only remote-write marker; safe retry scheduled", now: now() }) || getPublicationIntent(id)!;
      }
      throw error;
    }
  }); } finally {
    clearInterval(heartbeat);
    releaseAccountDispatchLease({ accountId: account.id, leaseToken: accountLease.leaseToken, now: now() });
  }
}

function retryAfterSeconds(retryAfter: string | undefined, reset: number | undefined, now: number): number {
  if (retryAfter) {
    const numeric = Number(retryAfter);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.min(86400, Math.floor(numeric));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(86400, Math.ceil(date / 1000 - now)));
  }
  if (reset && reset > now) return Math.min(86400, reset - now);
  return 60;
}

export async function runApprovedPublicationIntents(limit = 10): Promise<Array<{ id: number; ok: boolean; reason?: string }>> {
  await recoverStalePublicationDispatches();
  if (!(await import("./pipeline")).publishingEnabled()) return [];
  const results: Array<{ id: number; ok: boolean; reason?: string }> = [];
  for (const intent of getPublicationIntents({ status: "approved", limit: Math.max(1, Math.min(50, limit)) })) {
    try {
      const result = await dispatchPublicationIntent(intent.id);
      results.push({ id: intent.id, ok: result.status === "pending_reconciliation", reason: result.reason });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      results.push({ id: intent.id, ok: false, reason });
    }
  }
  return results;
}

/** A crashed dispatch is ambiguous; reconcile known remote evidence and never resend it. */
export async function recoverStalePublicationDispatches(now = Math.floor(Date.now() / 1000)): Promise<number> {
  let recovered = 0;
  recovered += recoverExpiredPublicationIntents({ now });
  for (const intent of getPublicationIntents({ status: "dispatching", limit: 100 })) {
    const cutoff = now - STALE_DISPATCH_SECONDS;
    if (intent.updatedAt > cutoff) continue;
    const status = remoteId(intent) ? "pending_reconciliation" : "reconciliation_required";
    const updated = recoverStalePublicationIntent(
      intent.id,
      cutoff,
      status,
      status === "pending_reconciliation" ? "stale dispatch; known receipt is being reconciled, no retry" : "stale dispatch has no remote receipt; manual reconciliation required, no retry",
      now,
    );
    if (updated) recovered += 1;
  }
  return recovered;
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

export async function reconcilePublicationIntents(limit = 20, options: { client?: OfficialXClient; now?: () => number } = {}): Promise<number> {
  await recoverStalePublicationDispatches();
  let confirmed = 0;
  for (const intent of getPublicationIntents({ status: "pending_reconciliation", limit })) {
    const id = remoteId(intent);
    if (!id) {
      updatePublicationIntent({ id: intent.id, status: "reconciliation_required", reason: "remote post id bulunamadı; kör retry yapılmadı", now: Math.floor(Date.now() / 1000) });
      continue;
    }
    const now = options.now?.() ?? Math.floor(Date.now() / 1000);
    const account = getAccounts().find((item) => item.id === intent.accountId);
    if (!account?.ownerUserId || !isOwnerEnabled(account.ownerUserId)) continue;
    const runId = claimMonitorRun({ targetId: null, dayKey: istanbulDayKey(now), bucket: "reconciliation", now });
    if (!runId) break;
    try {
      const matched = await runAsOwner(account.ownerUserId, async () => withOfficialAccount(account, async (credential) => {
        if (!credential.scopes.includes("tweet.read")) throw new Error("tweet.read scope is required for reconciliation");
        const client = options.client || new OfficialXClient();
        const post = await client.getPost({ accessToken: credential.accessToken, xUserId: credential.xUserId }, id);
        if (!post || post.id !== id || post.author_id !== credential.xUserId || post.text !== intent.text) return false;
        const url = `https://x.com/${account.handle}/status/${id}`;
        const confirmedIntent = confirmPublicationIntentRemote({ id: intent.id, remotePostId: id, remoteUrl: url, now });
        if (!confirmedIntent) return false;
        updateDraft({ id: intent.draftId, status: "confirmed", now });
        confirmPublicationIntentAttempt(intent.id, now);
        syncIntentPublication(intent.id, now);
        return true;
      }));
      finishBudgetRun(runId, "success", now);
      if (matched) confirmed += 1;
      else updatePublicationIntent({ id: intent.id, status: "reconciliation_required", reason: "exact receipt lookup did not confirm this account; manual reconciliation required", now });
    } catch (error) {
      finishBudgetRun(runId, "failed", Math.floor(Date.now() / 1000), error instanceof Error ? error.message : String(error));
      // Ambiguous remote state stays pending; never blind-retry a write.
    }
  }
  return confirmed;
}
