import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getPostgresDb } from "./postgres";
import { getPostgresAccount } from "./postgres-accounts";
import { getPostgresDraft } from "./postgres-drafts";
import { currentOwnerId } from "./owner-context";
import { FxTwitterReader, type XPost } from "./x-reader";
import { postIdFromUrl } from "@/lib/post-url";

export const PUBLISHING_METHODS = ["x_web_intent", "x_native_schedule", "manual_import"] as const;
export type PublishingMethod = typeof PUBLISHING_METHODS[number];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function owner() { const id = currentOwnerId(); if (!id) throw new Error("authentication required"); return id; }

export function prepareShare(text: string, method: PublishingMethod, targetId = "", format = "post") {
  if (!PUBLISHING_METHODS.includes(method) || !text.trim() || [...text].length > 280) throw new Error("Unsupported publishing content");
  if (!["post", "reply", "quote"].includes(format)) throw new Error("This method supports one post at a time");
  const params = new URLSearchParams({ text });
  if (format !== "post") {
    if (!/^\d{1,19}$/.test(targetId)) throw new Error("Missing target post");
    if (format === "reply") params.set("in_reply_to", targetId);
    else params.set("text", `${text}\nhttps://x.com/i/web/status/${targetId}`);
  }
  const preparedText = params.get("text")!;
  if ([...preparedText].length > 280) throw new Error("Prepared content exceeds the post limit");
  return { preparedText, method, automatic: false, requiresUserAction: true, status: "awaiting_user_action", url: method === "manual_import" ? null : `https://x.com/intent/tweet?${params}`, scheduling: method === "x_native_schedule" ? "complete_on_x" : "none", verification: "not_published" };
}

export function receiptMatches(post: XPost, snapshot: { x_user_id: unknown; text_hash: unknown; text: unknown; format: unknown; target_id: unknown }) {
  if (post.author.id !== snapshot.x_user_id) return false;
  if (snapshot.format === "reply" && post.replyToPostId !== snapshot.target_id) return false;
  if (snapshot.format === "post" && (post.replyToPostId || post.quotedPostId)) return false;
  if (snapshot.format === "quote") {
    if (post.replyToPostId) return false;
    // Web Intent may leave the target URL in text or expose it as a quoted post.
    if (post.quotedPostId === snapshot.target_id && post.text === snapshot.text) return true;
    if (post.quotedPostId && post.quotedPostId !== snapshot.target_id) return false;
  }
  return hash(post.text) === snapshot.text_hash;
}

export async function preparePublication(draftId: number, method: PublishingMethod) {
  const ownerUserId = owner();
  const draft = await getPostgresDraft(draftId);
  if (!draft?.accountId) throw new Error("Owned draft with a target account required");
  const account = await getPostgresAccount(ownerUserId, draft.accountId);
  if (!account?.enabled || !account.xUserId || !account.ownershipVerifiedAt) throw new Error("Verified account ownership required");
  const preparation = prepareShare(draft.text, method, draft.externalId, draft.format);
  const id = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 86400;
  await getPostgresDb().execute(sql`INSERT INTO ispatla_app.publication_preparations(id,owner_user_id,draft_id,account_id,x_user_id,text,text_hash,format,target_id,method,expires_at)
    VALUES(${id},${ownerUserId},${draft.id},${account.id},${account.xUserId},${draft.text},${hash(preparation.preparedText)},${draft.format},${draft.externalId},${method},${expiresAt})`);
  return { ...preparation, id, handle: account.handle, expiresAt };
}

export async function publicationStatus(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid preparation ID");
  const result = await getPostgresDb().execute(sql`SELECT id,draft_id,account_id,method,expires_at,post_id,evidence,verified_at FROM ispatla_app.publication_preparations WHERE id=${id} AND owner_user_id=${owner()}`);
  return result.rows[0] || null;
}

export async function attachPublicationReceipt(id: string, url: string, expectedDraftId?: number) {
  const ownerUserId = owner();
  const postId = postIdFromUrl(url);
  if (!postId || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid publication receipt");
  const snapshot = await getPostgresDb().execute(sql`SELECT * FROM ispatla_app.publication_preparations WHERE id=${id} AND owner_user_id=${ownerUserId}`);
  const row = snapshot.rows[0];
  const now = Math.floor(Date.now() / 1000);
  if (!row || (expectedDraftId !== undefined && Number(row.draft_id) !== expectedDraftId) || Number(row.expires_at) <= now) throw new Error("Preparation unavailable or expired");
  const post = await new FxTwitterReader().fetchPostMetrics({ externalId: postId });
  if (!receiptMatches(post, row as Parameters<typeof receiptMatches>[1])) throw new Error("Post author or text does not match the preparation");
  await getPostgresDb().transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT p.* FROM ispatla_app.publication_preparations p JOIN ispatla_app.drafts d ON d.id=p.draft_id JOIN ispatla_app.accounts a ON a.id=p.account_id
      WHERE p.id=${id} AND p.owner_user_id=${ownerUserId} AND d.owner_user_id=${ownerUserId} AND a.owner_user_id=${ownerUserId} AND a.enabled=true AND a.ownership_verified_at IS NOT NULL
      AND a.x_user_id=p.x_user_id AND p.expires_at>${now} AND d.text=p.text AND d.account_id=p.account_id AND d.format=p.format AND d.external_id=p.target_id FOR UPDATE OF p,d,a`);
    if (!locked.rows.length) throw new Error("Preparation target changed");
    const attached = await tx.execute(sql`UPDATE ispatla_app.publication_preparations SET post_id=${postId},evidence='fxtwitter_observed',verified_at=${now} WHERE id=${id} AND owner_user_id=${ownerUserId} AND (post_id IS NULL OR post_id=${postId}) RETURNING id`);
    if (!attached.rows.length) throw new Error("A different receipt is already attached");
  });
  return publicationStatus(id);
}
