import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresDb } from "@/server/postgres";
import type { LeaderboardEvidence, OwnHitShare, PublicHitShare, ShareableXPost } from "@/server/db-types";

type EvidenceRow = {
  prediction_id: string; account_id: number | string; account_handle: string; intent_remote_post_id: string;
  remote_url: string; published_text: string; observed_at: number | string; captured_at: number | string;
  views: number | null; likes: number | null; replies: number | null; reposts: number | null; quotes: number | null;
  provenance_ref: string; followers_count: number | string | null; followers_observed_at: number | string | null;
  followers_x_user_id: string | null; followers_provenance_ref: string | null; censored_json: string;
  x_user_id: string | null; auth_state: string | null; public_id?: string;
};
function ownerId(): string {
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated profile owner required");
  return owner;
}
function mapEvidence(row: EvidenceRow): ShareableXPost | null {
  let url: URL;
  try { url = new URL(row.remote_url); } catch { return null; }
  if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname.toLowerCase())) return null;
  const postId = url.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1];
  if (!postId || (row.intent_remote_post_id && row.intent_remote_post_id !== postId)) return null;
  const provenance = row.provenance_ref.match(/^official_x:(\d+):(\d+):published_at=(\d+)$/);
  const accountId = Number(row.account_id), observedAt = Number(row.observed_at), capturedAt = Number(row.captured_at);
  if (!provenance || Number(provenance[1]) !== accountId || provenance[2] !== postId) return null;
  const publishedAt = Number(provenance[3]);
  if (!Number.isSafeInteger(publishedAt) || publishedAt <= 0 || observedAt < publishedAt || capturedAt < observedAt) return null;
  if (![row.views, row.likes, row.replies, row.reposts, row.quotes].some((value) => value !== null)) return null;
  return { remotePostId: postId, accountHandle: row.account_handle, postUrl: row.remote_url, text: row.published_text, publishedAt,
    observedAt: capturedAt, metrics: { views: row.views, likes: row.likes, replies: row.replies, reposts: row.reposts, quotes: row.quotes } };
}
async function evidence(owner: string, remotePostId?: string, leaderboard = false): Promise<EvidenceRow[]> {
  const postFilter = remotePostId ? sql`AND (intent.remote_post_id=${remotePostId} OR intent.remote_url LIKE ${`%/status/${remotePostId}`} OR intent.remote_url LIKE ${`%/status/${remotePostId}/`})` : sql``;
  const account = leaderboard ? sql`JOIN ispatla_app.x_oauth_accounts oauth ON oauth.account_id=account.id AND oauth.owner_user_id=prediction.owner_user_id` : sql``;
  const accountFields = leaderboard ? sql`oauth.x_user_id,oauth.auth_state` : sql`NULL::text AS x_user_id,NULL::text AS auth_state`;
  const observationWindow = leaderboard ? sql`AND latest.observed_at - substring(latest.provenance_ref FROM 'published_at=([0-9]+)')::bigint BETWEEN 86400 AND 108000` : sql``;
  const result = await getPostgresDb().execute(sql`SELECT prediction.id AS prediction_id,account.id AS account_id,account.handle AS account_handle,
    intent.remote_post_id AS intent_remote_post_id,intent.remote_url,approval.text AS published_text,outcome.observed_at,outcome.captured_at,
    outcome.views,outcome.likes,outcome.replies,outcome.reposts,outcome.quotes,outcome.provenance_ref,
    outcome.followers_count,outcome.followers_observed_at,outcome.followers_x_user_id,outcome.followers_provenance_ref,
    outcome.censored_json,${accountFields}
    FROM ispatla_app.evaluation_predictions prediction
    JOIN ispatla_app.accounts account ON account.id=prediction.account_id::bigint AND account.owner_user_id=prediction.owner_user_id
    ${account}
    JOIN ispatla_app.publication_intents intent ON intent.account_id=account.id AND intent.status='confirmed' AND intent.confirmed_at IS NOT NULL AND prediction.created_at<=intent.requested_at
    JOIN ispatla_app.drafts intent_draft ON intent_draft.id=intent.draft_id AND intent_draft.owner_user_id=prediction.owner_user_id
    JOIN ispatla_app.publication_approval_snapshots approval ON approval.id=intent.approval_snapshot_id AND approval.entity_type='publication_intent'
      AND approval.entity_id=intent.id AND approval.draft_id=intent.draft_id AND approval.account_id=account.id AND approval.action='post' AND approval.format='post'
      AND approval.external_id=(prediction.features_json::jsonb->>'sourceCandidateId') AND approval.text=intent.text
      AND approval.approved_at>=prediction.created_at AND approval.approved_at<=COALESCE(intent.dispatched_at,intent.confirmed_at)
      AND approval.expires_at>=COALESCE(intent.dispatched_at,intent.confirmed_at)
    JOIN ispatla_app.evaluation_outcome_revisions outcome ON outcome.owner_user_id=prediction.owner_user_id AND outcome.prediction_id=prediction.id AND outcome.source='official_x_api'
      AND outcome.id=(SELECT latest.id FROM ispatla_app.evaluation_outcome_revisions latest WHERE latest.owner_user_id=prediction.owner_user_id
        AND latest.prediction_id=prediction.id AND latest.source='official_x_api' ${observationWindow}
        ORDER BY latest.captured_at ${sql.raw(leaderboard ? "ASC" : "DESC")},latest.id ${sql.raw(leaderboard ? "ASC" : "DESC")} LIMIT 1)
    WHERE prediction.owner_user_id=${owner} AND prediction.action='post' AND (prediction.features_json::jsonb->>'decision')='eligible'
      AND outcome.provenance_ref LIKE ('official_x:' || account.id || ':%:published_at=%')
      AND (outcome.views IS NOT NULL OR outcome.likes IS NOT NULL OR outcome.replies IS NOT NULL OR outcome.reposts IS NOT NULL OR outcome.quotes IS NOT NULL)
      ${postFilter} ORDER BY outcome.captured_at DESC,prediction.id DESC LIMIT 500`);
  return result.rows as EvidenceRow[];
}

export async function getPostgresHitSharingSettings() {
  const owner = ownerId();
  const [posts, shares] = await Promise.all([evidence(owner), listPostgresOwnHitShares(owner)]);
  return { posts: posts.map(mapEvidence).filter((post): post is ShareableXPost => post !== null).slice(0, 100), shares };
}
async function listPostgresOwnHitShares(owner: string): Promise<OwnHitShare[]> {
  const result = await getPostgresDb().execute(sql`SELECT public_id,remote_post_id,created_at,revoked_at,leaderboard_opt_in
    FROM ispatla_app.hit_shares WHERE owner_user_id=${owner} ORDER BY created_at DESC,id DESC LIMIT 100`);
  return (result.rows as Array<{public_id:string;remote_post_id:string;created_at:number;revoked_at:number|null;leaderboard_opt_in:number}>).map(row => ({
    publicId:row.public_id,remotePostId:row.remote_post_id,createdAt:Number(row.created_at),revokedAt:row.revoked_at==null?null:Number(row.revoked_at),leaderboardOptIn:row.leaderboard_opt_in===1,
  }));
}
export async function createPostgresHitShare(remotePostId: string, now = Math.floor(Date.now()/1000)): Promise<OwnHitShare> {
  const owner=ownerId();
  if (!/^\d{1,32}$/.test(remotePostId)) throw new Error("geçerli bir 𝕏 gönderi kimliği gerekli");
  if (!Number.isSafeInteger(now)||now<0) throw new Error("paylaşım zamanı geçersiz");
  return getPostgresDb().transaction(async tx => {
    const rows=await evidence(owner,remotePostId);
    const hit=rows.find(row=>mapEvidence(row)?.remotePostId===remotePostId);
    if (!hit) throw new Error("resmi 𝕏 verisiyle doğrulanmış kendi gönderisi bulunamadı");
    const existing=await tx.execute(sql`SELECT public_id,remote_post_id,created_at,revoked_at,leaderboard_opt_in FROM ispatla_app.hit_shares
      WHERE owner_user_id=${owner} AND remote_post_id=${remotePostId} AND revoked_at IS NULL LIMIT 1`);
    const current=existing.rows[0] as {public_id:string;remote_post_id:string;created_at:number;revoked_at:number|null;leaderboard_opt_in:number}|undefined;
    if(current) return {publicId:current.public_id,remotePostId:current.remote_post_id,createdAt:Number(current.created_at),revokedAt:current.revoked_at==null?null:Number(current.revoked_at),leaderboardOptIn:current.leaderboard_opt_in===1};
    const publicId=randomBytes(24).toString("base64url");
    const inserted=await tx.execute(sql`INSERT INTO ispatla_app.hit_shares(public_id,owner_user_id,account_id,prediction_id,remote_post_id,created_at,revoked_at)
      VALUES(${publicId},${owner},${hit.account_id},${hit.prediction_id},${remotePostId},${now},NULL)
      ON CONFLICT DO NOTHING RETURNING public_id`);
    if (!inserted.rows.length) {
      const raced=await tx.execute(sql`SELECT public_id,remote_post_id,created_at,revoked_at,leaderboard_opt_in FROM ispatla_app.hit_shares
        WHERE owner_user_id=${owner} AND remote_post_id=${remotePostId} AND revoked_at IS NULL LIMIT 1`);
      const row=raced.rows[0] as {public_id:string;remote_post_id:string;created_at:number;revoked_at:number|null;leaderboard_opt_in:number}|undefined;
      if(row) return {publicId:row.public_id,remotePostId:row.remote_post_id,createdAt:Number(row.created_at),revokedAt:null,leaderboardOptIn:row.leaderboard_opt_in===1};
      throw new Error("paylaşım bağlantısı oluşturulamadı");
    }
    return {publicId,remotePostId,createdAt:now,revokedAt:null,leaderboardOptIn:false};
  });
}
export async function revokePostgresHitShare(publicId:string,now=Math.floor(Date.now()/1000)):Promise<boolean>{
  const owner=ownerId();if(!/^[A-Za-z0-9_-]{32}$/.test(publicId))return false;if(!Number.isSafeInteger(now)||now<0)throw new Error("revoke time is invalid");
  const result=await getPostgresDb().execute(sql`UPDATE ispatla_app.hit_shares SET revoked_at=${now} WHERE public_id=${publicId} AND owner_user_id=${owner} AND revoked_at IS NULL RETURNING public_id`);
  return result.rows.length>0;
}
export async function setPostgresHitLeaderboardOptIn(publicId:string,enabled:boolean):Promise<boolean>{
  const owner=ownerId();if(!/^[A-Za-z0-9_-]{32}$/.test(publicId)||typeof enabled!=="boolean")return false;
  const result=await getPostgresDb().execute(sql`UPDATE ispatla_app.hit_shares SET leaderboard_opt_in=${enabled?1:0}
    WHERE public_id=${publicId} AND owner_user_id=${owner} AND revoked_at IS NULL RETURNING public_id`);return result.rows.length>0;
}
export async function getPostgresPublicHitShare(publicId:string):Promise<PublicHitShare|null>{
  if(!/^[A-Za-z0-9_-]{32}$/.test(publicId))return null;
  const rows=await getPostgresDb().execute(sql`SELECT hit.public_id,${sql.raw("prediction.id")} AS prediction_id,account.id AS account_id,account.handle AS account_handle,
    intent.remote_post_id AS intent_remote_post_id,intent.remote_url,approval.text AS published_text,outcome.observed_at,outcome.captured_at,
    outcome.views,outcome.likes,outcome.replies,outcome.reposts,outcome.quotes,outcome.provenance_ref,NULL::bigint AS followers_count,
    NULL::bigint AS followers_observed_at,NULL::text AS followers_x_user_id,NULL::text AS followers_provenance_ref,'[]'::text AS censored_json,
    NULL::text AS x_user_id,NULL::text AS auth_state
    FROM ispatla_app.hit_shares hit JOIN ispatla_app.evaluation_predictions prediction ON prediction.id=hit.prediction_id AND prediction.owner_user_id=hit.owner_user_id
    JOIN ispatla_app.accounts account ON account.id=hit.account_id AND account.owner_user_id=hit.owner_user_id AND account.id=prediction.account_id::bigint
    JOIN ispatla_app.publication_intents intent ON intent.account_id=account.id AND intent.status='confirmed' AND intent.confirmed_at IS NOT NULL
    JOIN ispatla_app.drafts intent_draft ON intent_draft.id=intent.draft_id AND intent_draft.owner_user_id=prediction.owner_user_id
    JOIN ispatla_app.publication_approval_snapshots approval ON approval.id=intent.approval_snapshot_id AND approval.entity_type='publication_intent'
      AND approval.entity_id=intent.id AND approval.draft_id=intent.draft_id AND approval.account_id=account.id AND approval.action='post' AND approval.format='post'
      AND approval.external_id=(prediction.features_json::jsonb->>'sourceCandidateId') AND approval.text=intent.text AND approval.approved_at>=prediction.created_at
      AND approval.approved_at<=COALESCE(intent.dispatched_at,intent.confirmed_at) AND approval.expires_at>=COALESCE(intent.dispatched_at,intent.confirmed_at)
    JOIN ispatla_app.evaluation_outcome_revisions outcome ON outcome.owner_user_id=hit.owner_user_id AND outcome.prediction_id=prediction.id AND outcome.source='official_x_api'
      AND outcome.id=(SELECT latest.id FROM ispatla_app.evaluation_outcome_revisions latest WHERE latest.owner_user_id=hit.owner_user_id AND latest.prediction_id=prediction.id
      AND latest.source='official_x_api' ORDER BY latest.captured_at DESC,latest.id DESC LIMIT 1)
    WHERE hit.public_id=${publicId} AND hit.revoked_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM ispatla_auth.auth_user_status status WHERE status.owner_user_id=hit.owner_user_id AND status.status='disabled') AND (intent.remote_post_id='' OR hit.remote_post_id=intent.remote_post_id)
      AND prediction.action='post' AND prediction.created_at<=intent.requested_at AND (prediction.features_json::jsonb->>'decision')='eligible'
      AND outcome.provenance_ref LIKE ('official_x:' || account.id || ':' || hit.remote_post_id || ':published_at=%')
      AND (outcome.views IS NOT NULL OR outcome.likes IS NOT NULL OR outcome.replies IS NOT NULL OR outcome.reposts IS NOT NULL OR outcome.quotes IS NOT NULL) LIMIT 1`);
  const row=rows.rows[0] as EvidenceRow|undefined;const post=row&&mapEvidence(row);
  return post?{...post,publicId,verification:"official_x_api"}:null;
}
export async function getPostgresLeaderboardEvidence():Promise<LeaderboardEvidence[]>{
  const shares=(await getPostgresDb().execute(sql`SELECT owner_user_id,account_id,remote_post_id,public_id,prediction_id FROM ispatla_app.hit_shares hit
    WHERE revoked_at IS NULL AND leaderboard_opt_in=1
      AND NOT EXISTS (SELECT 1 FROM ispatla_auth.auth_user_status status WHERE status.owner_user_id=hit.owner_user_id AND status.status='disabled') ORDER BY created_at DESC,id DESC LIMIT 500`)).rows as Array<{owner_user_id:string;account_id:number;remote_post_id:string;public_id:string;prediction_id:string}>;
  const result:LeaderboardEvidence[]=[];
  for(const owner of new Set(shares.map(s=>s.owner_user_id))){
    const excluded=(await getPostgresDb().execute(sql`SELECT account_id,remote_post_id FROM ispatla_app.hit_evidence_exclusions WHERE owner_user_id=${owner}`)).rows as Array<{account_id:number;remote_post_id:string}>;
    const seen=new Set<string>();
    for(const row of await evidence(owner,undefined,true)){
      const post=mapEvidence(row), accountId=Number(row.account_id), followers=Number(row.followers_count), observedAt=Number(row.observed_at);
      if(!post||row.auth_state!=="connected"||!Number.isSafeInteger(followers)||followers<=0
        ||Number(row.followers_observed_at)!==observedAt||row.followers_x_user_id!==row.x_user_id||row.followers_provenance_ref!==`official_x_user:${accountId}:${row.x_user_id}`
        ||!["[]",'["views"]'].includes(row.censored_json)||[row.likes,row.replies,row.reposts,row.quotes].some(v=>v===null||!Number.isSafeInteger(v)||v<0)
        ||excluded.some(x=>Number(x.account_id)===accountId&&x.remote_post_id===post.remotePostId))continue;
      const key=`${accountId}:${post.remotePostId}`;if(seen.has(key))continue;seen.add(key);
      const share=shares.find(s=>s.owner_user_id===owner&&Number(s.account_id)===accountId&&s.remote_post_id===post.remotePostId&&s.prediction_id===row.prediction_id);
      if(share&&!await getPostgresPublicHitShare(share.public_id))continue;
      result.push({...post,observedAt,ownerUserId:owner,accountId,followers,publicId:share?.public_id??null});
    }
  }
  return result;
}
