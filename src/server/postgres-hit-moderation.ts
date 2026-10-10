import { sql } from "drizzle-orm";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";

export async function setPostgresHitEvidenceExcluded(publicId: string, excluded: boolean, reason: string, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const operator = currentOwnerId();
  if (!operator || operator !== process.env.ISPATLA_OPERATOR_USER_ID) throw new Error("operator authorization required");
  if (!/^[A-Za-z0-9_-]{32}$/.test(publicId) || typeof excluded !== "boolean" || typeof reason !== "string" || reason.length > 500 || (excluded && !reason.trim())) {
    throw new Error("invalid moderation request");
  }

  return getPostgresDb().transaction(async (tx) => {
    const share = await tx.execute(sql`SELECT owner_user_id,account_id,remote_post_id FROM ispatla_app.hit_shares WHERE public_id=${publicId} LIMIT 1`);
    const hit = share.rows[0] as { owner_user_id: string; account_id: number | string; remote_post_id: string } | undefined;
    if (!hit) return false;
    if (excluded) {
      await tx.execute(sql`INSERT INTO ispatla_app.hit_evidence_exclusions(owner_user_id,account_id,remote_post_id,reason,flagged_at)
        VALUES(${hit.owner_user_id},${hit.account_id},${hit.remote_post_id},${reason.trim()},${now})
        ON CONFLICT(owner_user_id,account_id,remote_post_id) DO UPDATE SET reason=EXCLUDED.reason,flagged_at=EXCLUDED.flagged_at`);
    } else {
      await tx.execute(sql`DELETE FROM ispatla_app.hit_evidence_exclusions WHERE owner_user_id=${hit.owner_user_id} AND account_id=${hit.account_id} AND remote_post_id=${hit.remote_post_id}`);
    }
    return true;
  });
}
