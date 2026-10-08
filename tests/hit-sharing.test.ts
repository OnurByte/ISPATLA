import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function isolated(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-hit-sharing-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script], cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_DEMO: "1", ISPATLA_SECRET_KEY: "hit-test-vault-key", ISPATLA_TOKEN_KEY_CURRENT: "hit-test-token-key", X_OAUTH_CLIENT_ID: "hit-client", X_OAUTH_CLIENT_SECRET: "hit-secret", X_OAUTH_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback" },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, `${new TextDecoder().decode(result.stdout)}\n${new TextDecoder().decode(result.stderr)}`).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("hit shares require an official own-post observation, expose a narrow projection, and revoke immediately", () => {
  const result = JSON.parse(isolated(`
    process.env.ISPATLA_DEMO="0";
    import { Database } from "bun:sqlite";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { ensureDatabase, createDraft, createPublicationIntent, createPublicationApproval, updatePublicationIntent, saveAccount } from "./src/server/db.ts";
    import { connectXAccount } from "./src/server/x-oauth-store.ts";
    import { collectDueShadowOutcomes, recordShadowDecision } from "./src/server/shadow-evaluation.ts";
    import { ensureEvaluationStore } from "./src/server/evaluation-store.ts";
    import { createOwnHitShare, getPublicHitShare, listOwnHitShares, listOwnShareableXPosts, revokeOwnHitShare } from "./src/server/db.ts";
    ensureDatabase(); ensureEvaluationStore();
    const now=Math.floor(Date.now()/1000), createdAt=now-16*86400, confirmedAt=createdAt+200;
    const accountId=connectXAccount({ownerUserId:"owner-a",xUserId:"501001",handle:"owner_a",displayName:"Owner A",accessToken:"fixture-access",refreshToken:"fixture-refresh",expiresAt:9999999999,scopes:["tweet.read","tweet.write","users.read","media.write","offline.access"],now:createdAt}).accountId;
    const prediction=runAsOwner("owner-a",()=>recordShadowDecision({
      post:{externalId:"source-post",clusterKey:"event-group",sourceHandle:"source",createdTimestamp:createdAt-5,score:75,scoreReason:"deterministic:{}",sensitive:false},
      account:{id:accountId,ownerUserId:"owner-a"} as never,score:75,category:"technology",decision:"eligible",reason:"pass",createdAt,
    }));
    const intentId=runAsOwner("owner-a",()=>{
      const draft=createDraft({externalId:"source-post",accountId,format:"post",text:"approved publication text",sourceHandle:"source",now:createdAt});
      const intent=createPublicationIntent({draftId:draft.id,accountId,idempotencyKey:"hit-intent",text:"approved publication text",now:createdAt});
      createPublicationApproval({id:intent.id,now:createdAt+100});
      new Database(process.env.ISPATLA_DB).query("UPDATE drafts SET text='private later draft text' WHERE id=?").run(draft.id);
      updatePublicationIntent({id:intent.id,status:"confirmed",receipt:JSON.stringify({id:"900001"}),remoteUrl:"https://x.com/owner_a/status/900001",confirmedAt,now:confirmedAt});
      return intent.id;
    });
    const before=runAsOwner("owner-a",()=>({posts:listOwnShareableXPosts(),shares:listOwnHitShares(),public:getPublicHitShare("invalid") }));
    let prematureRejected=false;
    try { runAsOwner("owner-a",()=>createOwnHitShare("900001",now)); } catch { prematureRejected=true; }
    const client={getPost:async (credential,id)=>({id,author_id:credential.xUserId,created_at:new Date((createdAt+10)*1000).toISOString(),public_metrics:{like_count:0,reply_count:2,retweet_count:1,quote_count:0}})};
    const collected=await collectDueShadowOutcomes(now,client);
    const share=runAsOwner("owner-a",()=>createOwnHitShare("900001",now));
    const publicView=getPublicHitShare(share.publicId);
    const foreign={shares:runAsOwner("owner-b",()=>listOwnHitShares()),revoke:runAsOwner("owner-b",()=>revokeOwnHitShare(share.publicId,now+1))};
    const revoked=runAsOwner("owner-a",()=>revokeOwnHitShare(share.publicId,now+2));
    const after=getPublicHitShare(share.publicId);
    console.log(JSON.stringify({before,prematureRejected,collected,share,publicView,foreign,revoked,after,intentId,predictionId:prediction.id}));
  `));
  expect(result.before).toEqual({ posts: [], shares: [], public: null });
  expect(result.prematureRejected).toBe(true);
  expect(result.collected).toMatchObject({ checked: 1, collected: 1, unresolved: 0, failed: 0 });
  expect(result.share.publicId).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(result.publicView).toMatchObject({
    remotePostId: "900001", accountHandle: "owner_a", postUrl: "https://x.com/owner_a/status/900001",
    text: "approved publication text", verification: "official_x_api",
    metrics: { views: null, likes: 0, replies: 2, reposts: 1, quotes: 0 },
  });
  expect(Object.keys(result.publicView).sort()).toEqual(["accountHandle", "metrics", "observedAt", "postUrl", "publicId", "publishedAt", "remotePostId", "text", "verification"].sort());
  expect(JSON.stringify(result.publicView)).not.toContain("private later draft text");
  expect(JSON.stringify(result.publicView)).not.toContain("fixture-access");
  expect(JSON.stringify(result.publicView)).not.toContain(result.predictionId);
  expect(result.foreign).toEqual({ shares: [], revoke: false });
  expect(result.revoked).toBe(true);
  expect(result.after).toBeNull();
});

test("only a URL with an exact X status ID can be shared", () => {
  const output = JSON.parse(isolated(`
    import { ensureDatabase, saveAccount } from "./src/server/db.ts";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { ensureEvaluationStore } from "./src/server/evaluation-store.ts";
    import { listOwnShareableXPosts, createOwnHitShare } from "./src/server/db.ts";
    ensureDatabase(); ensureEvaluationStore();
    runAsOwner("empty-owner",()=>saveAccount({accountKey:"empty",handle:"empty",displayName:"Empty",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"]}));
    let rejected=false; try { runAsOwner("empty-owner",()=>createOwnHitShare("not-a-status")); } catch { rejected=true; }
    console.log(JSON.stringify({posts:runAsOwner("empty-owner",()=>listOwnShareableXPosts()),rejected}));
  `));
  expect(output).toEqual({ posts: [], rejected: true });
});
