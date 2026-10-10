import { createHash } from "node:crypto";
import type { PublicationIntent } from "./db-types";
import { currentOwnerId, runAsOwner } from "./owner-context";
import { getPostgresDraft } from "./postgres-drafts";
import { getPostgresAccount } from "./postgres-accounts";
import {
  approvePostgresPublicationIntent, createPostgresPublicationIntent, getPostgresPublicationIntent,
  listPostgresPublicationIntentsSystem, setPostgresPublicationIntentStatus,
} from "./postgres-queue-store";
import { OfficialXClient, OfficialXError } from "./official-x";
import { withOfficialAccount } from "./publisher";
import {
  claimPostgresAccountDispatchLease, isPostgresOwnerEnabled, publishingEnabled,
  recoverExpiredPostgresPublicationIntents, recoverOrphanedPostgresDispatches, releasePostgresAccountDispatchLease,
} from "./postgres-publishing";
import {
  confirmPostgresPublicationIntent, getPostgresPublicationIntentSystem, getPostgresReconciliationIntentIds,
  markPostgresPublicationReconciliationRequired,
} from "./postgres-queue-store";

const PG_POLICY_BLOCK = "Yayın gönderimi kapalı: PostgreSQL politika ve değerlendirme kanıtı henüz hazır değil.";

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function publicationIdempotencyKey(input: { draftId: number; accountId: number; text: string; mediaHash: string }): string {
  return sha256(`${input.draftId}\0${input.accountId}\0${input.text}\0${input.mediaHash}`);
}

export async function createIntentForDraft(draftId: number, accountId?: number | null, now = Math.floor(Date.now() / 1000)): Promise<PublicationIntent> {
  const owner = currentOwnerId();
  if (!owner) throw new Error("Oturum gerekli");
  const draft = await getPostgresDraft(draftId);
  if (!draft) throw new Error(`draft #${draftId} bulunamadı`);
  const resolvedAccountId = accountId ?? draft.accountId;
  if (!resolvedAccountId) throw new Error(`draft #${draftId}: aktif hesap eşleşmesi yok`);
  const account = await getPostgresAccount(owner, resolvedAccountId);
  if (!account?.enabled) throw new Error(`draft #${draftId}: aktif hesap eşleşmesi yok`);
  if (draft.accountId && draft.accountId !== resolvedAccountId) throw new Error("publication intent account does not match draft");
  if (draft.format !== "post") throw new Error(`draft #${draftId}: PublicationIntent yalnız post içindir`);
  if (!draft.text.trim()) throw new Error(`draft #${draftId}: post metni boş olamaz`);
  const mediaHash = "";
  return createPostgresPublicationIntent({ draftId, accountId: resolvedAccountId, text: draft.text, mediaHash,
    idempotencyKey: publicationIdempotencyKey({ draftId, accountId: resolvedAccountId, text: draft.text, mediaHash }), now });
}

export async function approvePublicationIntent(id: number, now = Math.floor(Date.now() / 1000), options: { approvalSource?: "human" | "automatic" } = {}): Promise<PublicationIntent> {
  const intent = await getPostgresPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (intent.status === "approved" && intent.approvalExpiresAt !== null && intent.approvalExpiresAt > now) return intent;
  if (intent.status === "approved" && intent.approvalExpiresAt !== null && intent.approvalExpiresAt <= now) {
    await setPostgresPublicationIntentStatus({ id, status: "expired", reason: "approval_expired_requires_new_intent", now });
    throw new Error("publication approval expired; create a new approval");
  }
  if (intent.status !== "pending_approval") throw new Error(`publication intent ${intent.status} durumunda onaylanamaz`);
  const approved = await approvePostgresPublicationIntent({ id, now, source: options.approvalSource });
  if (!approved) throw new Error("publication approval changed concurrently");
  return approved;
}

export async function cancelPublicationIntent(id: number, now = Math.floor(Date.now() / 1000)): Promise<PublicationIntent> {
  const intent = await getPostgresPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (intent.status === "cancelled") return intent;
  if (!["pending_approval", "approved", "blocked"].includes(intent.status)) throw new Error(`publication intent ${intent.status} durumunda iptal edilemez`);
  const cancelled = await setPostgresPublicationIntentStatus({ id, status: "cancelled", reason: "kullanıcı iptal etti", now });
  if (!cancelled) throw new Error("publication intent lease nedeniyle iptal edilemedi");
  return cancelled;
}

export type DispatchPublicationOptions = { now?: () => number; beforeSend?: () => void | Promise<void> };
export async function dispatchPublicationIntent(id: number, _options: DispatchPublicationOptions = {}): Promise<PublicationIntent> {
  const intent = await getPostgresPublicationIntent(id);
  if (!intent) throw new Error("publication intent bulunamadı");
  if (intent.status !== "approved") throw new Error(`publication intent ${intent.status} durumunda gönderilemez`);
  throw new Error(PG_POLICY_BLOCK);
}

export async function runApprovedPublicationIntents(limit = 10): Promise<Array<{ id: number; ok: boolean; reason?: string }>> {
  if (!(await publishingEnabled())) return [];
  return (await listPostgresPublicationIntentsSystem(Math.max(1, Math.min(50, limit)), "approved"))
    .map((intent) => ({ id: intent.id, ok: false, reason: PG_POLICY_BLOCK }));
}

export async function reconcilePublicationIntents(limit = 20, options: { client?: OfficialXClient; now?: () => number } = {}): Promise<number> {
  const now = options.now || (() => Math.floor(Date.now() / 1000));
  await recoverStalePublicationDispatches(now());
  const caller = currentOwnerId();
  const client = options.client || new OfficialXClient();
  let confirmed = 0;
  for (const id of await getPostgresReconciliationIntentIds(limit)) {
    const context = await getPostgresPublicationIntentSystem(id);
    const owner = context?.ownerUserId;
    if (!context || !owner || caller && caller !== owner || !(await isPostgresOwnerEnabled(owner))) continue;
    const intent = context.intent;
    const account = await getPostgresAccount(owner, intent.accountId);
    if (!account?.enabled) continue;
    const accountLease = await claimPostgresAccountDispatchLease({ accountId: account.id, ownerUserId: owner, now: now(), leaseSeconds: 120 });
    if (!accountLease) continue;
    try {
      const result = await runAsOwner(owner, async () => {
        if (!(await isPostgresOwnerEnabled(owner))) return false;
        const current = await getPostgresPublicationIntent(intent.id);
        if (!current || current.status !== "pending_reconciliation" || current.remoteWriteStartedAt === null) return false;
        const draft = await getPostgresDraft(current.draftId);
        if (!draft) return false;
        const id = remotePostId(current);
        if (!id) {
          await markPostgresPublicationReconciliationRequired({ id: current.id, ownerUserId: owner, now: now(), reason: "remote post id missing; manual reconciliation required" });
          return false;
        }
        return withOfficialAccount(account, async (credential) => {
          if (!credential.scopes.includes("tweet.read")) throw new Error("tweet.read scope is required for reconciliation");
          const post = await client.getPost({ accessToken: credential.accessToken, xUserId: credential.xUserId }, id);
          if (!post || post.id !== id || post.author_id !== credential.xUserId || post.text !== current.text) {
            await markPostgresPublicationReconciliationRequired({ id: current.id, ownerUserId: owner, now: now(), reason: "exact receipt lookup did not confirm this account; manual reconciliation required" });
            return false;
          }
          return confirmPostgresPublicationIntent({ id: current.id, ownerUserId: owner, now: now(), remotePostId: id, remoteUrl: `https://x.com/${account.handle}/status/${id}` });
        });
      });
      if (result) confirmed++;
    } catch (error) {
      // Provider read failures retain the remote-write marker for a later verification pass.
      if (error instanceof OfficialXError && error.code === "reauth") continue;
    } finally {
      await releasePostgresAccountDispatchLease({ ...accountLease, ownerUserId: owner, now: now() });
    }
  }
  return confirmed;
}

function remotePostId(intent: PublicationIntent): string {
  const fromUrl = intent.remoteUrl.match(/\/status\/(\d{1,19})/)?.[1];
  if (fromUrl) return fromUrl;
  try {
    const receipt = JSON.parse(intent.receipt) as Record<string, unknown>;
    const id = String(receipt.id || receipt.post_id || receipt.postId || "");
    return /^\d{1,19}$/.test(id) ? id : "";
  } catch { return ""; }
}

export async function recoverStalePublicationDispatches(now = Math.floor(Date.now() / 1000)): Promise<number> {
  const [expired, orphaned] = await Promise.all([
    recoverExpiredPostgresPublicationIntents(now),
    recoverOrphanedPostgresDispatches(now, now - 300),
  ]);
  return expired + orphaned;
}
