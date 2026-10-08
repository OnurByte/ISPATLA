import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankLeaderboardEvidence } from "../src/server/leaderboard";
import type { LeaderboardEvidence } from "../src/server/db";

const now = 1800000000, day = 86400;
function post(owner: string, id: number, daysAgo: number, likes: number, followers = 1000, shared = false): LeaderboardEvidence {
  const publishedAt = now - daysAgo * day;
  return { ownerUserId: owner, accountId: 1, accountHandle: owner, followers, remotePostId: String(id), publicId: shared ? `public-${owner}-${id}` : null,
    postUrl: `https://x.com/${owner}/status/${id}`, text: shared ? "public approved text" : "private baseline text", publishedAt,
    observedAt: publishedAt + day, metrics: { likes, replies: 0, reposts: 0, quotes: 0, views: null } };
}
function baseline(owner: string, followers = 1000) { return Array.from({ length: 5 }, (_, i) => post(owner, i + 1, 12 - i, followers / 100, followers)); }

test("hit ranking normalizes account size, uses private same-owner historical median, and exposes only opted-in candidates", () => {
  const result = rankLeaderboardEvidence([
    ...baseline("small"), post("small", 10, 2, 40, 1000, true),
    ...baseline("large", 100000), post("large", 10, 2, 3000, 100000, true),
    ...baseline("private"), post("private", 10, 2, 900, 1000),
    post("no-history", 10, 2, 99999, 1000, true),
  ], now);
  expect(result.week.map((item) => item.accountHandle)).toEqual(["small", "large"]);
  expect(result.week.map((item) => item.relativePerformance)).toEqual([4, 3]);
  expect(result.week[0].baselineSamples).toBe(5);
  expect(JSON.stringify(result)).not.toContain("private baseline text");
  expect(JSON.stringify(result)).not.toContain("ownerUserId");
  expect(JSON.stringify(result)).not.toContain("accountId");
});

test("null/censored metrics, mismatched observation age, future evidence and insufficient interaction counts cannot be hits", () => {
  const current = post("sample", 10, 2, 40, 1000, true);
  expect(rankLeaderboardEvidence([...baseline("sample"), { ...current, metrics: { ...current.metrics, replies: null } }], now).week).toEqual([]);
  expect(rankLeaderboardEvidence([...baseline("sample"), { ...current, observedAt: current.publishedAt + 30 * 3600 }], now).week).toEqual([]);
  expect(rankLeaderboardEvidence([...baseline("sample"), { ...current, observedAt: now + 1 }], now).week).toEqual([]);
  expect(rankLeaderboardEvidence([...baseline("sample").slice(1), current], now).week).toEqual([]);
  expect(rankLeaderboardEvidence([...baseline("sample").map((item) => ({ ...item, metrics: { ...item.metrics, likes: 1 } })), { ...current, metrics: { ...current.metrics, likes: 9 } }], now).week).toEqual([]);
  expect(rankLeaderboardEvidence([...baseline("foreign"), current], now).week).toEqual([]);
});

test("account and improvement boards require five comparable samples per period and an opted-in representative", () => {
  const evidence = Array.from({ length: 5 }, (_, i) => post("growing", i, 75 - i, 10));
  for (let i = 0; i < 5; i++) evidence.push(post("growing", 10 + i, 45 - i, 20, 1000, true));
  for (let i = 0; i < 5; i++) evidence.push(post("growing", 20 + i, 10 - i, 40, 1000, true));
  const result = rankLeaderboardEvidence(evidence, now);
  expect(result.accounts).toHaveLength(1);
  expect(result.improvement).toEqual([{ accountHandle: "growing", publicId: "public-growing-24", score: 2, samples: 5 }]);
  expect(rankLeaderboardEvidence(evidence.slice(0, -1), now).accounts).toEqual([]);
});

test("private poor outcomes reduce aggregate scores; participation cannot cherry-pick the account sample", () => {
  const evidence = Array.from({ length: 5 }, (_, i) => post("selective", i, 75 - i, 10));
  for (let i = 0; i < 5; i++) evidence.push(post("selective", 10 + i, 45 - i, 20));
  for (let i = 0; i < 5; i++) evidence.push(post("selective", 20 + i, 10 - i, 40, 1000, true));
  const exceptionalOnly = rankLeaderboardEvidence(evidence, now);
  const privatePoor = Array.from({ length: 6 }, (_, i) => post("selective", 30 + i, 2 + i / 6, 1));
  const withPoor = rankLeaderboardEvidence([...evidence, ...privatePoor], now);
  expect(withPoor.accounts[0].samples).toBe(11);
  expect(withPoor.accounts[0].score).toBeLessThan(exceptionalOnly.accounts[0].score);
  expect(withPoor.improvement[0].score).toBeLessThan(exceptionalOnly.improvement[0].score);
  expect(withPoor.improvement[0].score).toBe(0.05);
  expect(JSON.stringify(withPoor)).not.toContain("private baseline text");
  expect(JSON.stringify(withPoor)).not.toContain("ownerUserId");
  expect(JSON.stringify(withPoor)).not.toContain("status/30");
  const privateAccount = rankLeaderboardEvidence([...evidence, ...privatePoor].map((item) => ({ ...item, publicId: null })), now);
  expect(privateAccount).toEqual({ week: [], month: [], accounts: [], improvement: [] });
  const singleCard = rankLeaderboardEvidence([...evidence, ...privatePoor].map((item) => item.remotePostId === "24" ? item : { ...item, publicId: null }), now);
  expect(singleCard.accounts).toEqual(withPoor.accounts);
  expect(singleCard.improvement).toEqual(withPoor.improvement);
});

test("real approved evidence enforces explicit opt-in, official identity/time, owner isolation, persistent moderation and immediate revocation", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-leaderboard-"));
  try {
    const script = `
      import { Database } from "bun:sqlite";
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { ensureDatabase,createDraft,createPublicationIntent,createPublicationApproval,updatePublicationIntent,createOwnHitShare,setOwnHitLeaderboardOptIn,revokeOwnHitShare,setHitEvidenceExcluded,listQualifiedLeaderboardEvidence } from "./src/server/db.ts";
      import { connectXAccount } from "./src/server/x-oauth-store.ts";
      import { recordShadowDecision } from "./src/server/shadow-evaluation.ts";
      import { ensureEvaluationStore,appendObservedOutcome } from "./src/server/evaluation-store.ts";
      import { getLeaderboard } from "./src/server/leaderboard.ts";
      ensureDatabase();ensureEvaluationStore();
      const now=${now},day=86400;
      const accountId=connectXAccount({ownerUserId:"owner",xUserId:"12345",handle:"own",displayName:"Own",accessToken:"private-token",refreshToken:"private-refresh",expiresAt:9999999999,scopes:["tweet.read","tweet.write","users.read","media.write","offline.access"],now:now-20*day}).accountId;
      runAsOwner("owner",()=>{
        for(let i=0;i<6;i++) {
          const published=now-(i<5?12-i:2)*day,created=published-100;
          const prediction=recordShadowDecision({post:{externalId:"source-"+i,clusterKey:"group-"+i,sourceHandle:"source",createdTimestamp:created-5,score:75,scoreReason:"deterministic:{}",sensitive:false},account:{id:accountId,ownerUserId:"owner"},score:75,category:"tech",decision:"eligible",reason:"pass",createdAt:created});
          const draft=createDraft({externalId:"source-"+i,accountId,format:"post",text:i===5?"public approved":"private baseline",sourceHandle:"source",now:created});
          const intent=createPublicationIntent({draftId:draft.id,accountId,idempotencyKey:"intent-"+i,text:draft.text,now:created});
          createPublicationApproval({id:intent.id,now:created+5});
          updatePublicationIntent({id:intent.id,status:"confirmed",receipt:JSON.stringify({id:String(9000+i)}),remoteUrl:"https://x.com/own/status/"+(9000+i),confirmedAt:published,now:published});
          const observedAt=published+day;
          appendObservedOutcome({predictionId:prediction.id,capturedAt:observedAt,observedAt,metrics:{views:null,likes:i===5?40:10,replies:0,reposts:0,quotes:0},censored:["views"],source:"official_x_api",provenanceRef:"official_x:"+accountId+":"+(9000+i)+":published_at="+published,followersEvidence:{count:1000,observedAt,xUserId:"12345",provenanceRef:"official_x_user:"+accountId+":12345"}});
        }
      });
      const share=runAsOwner("owner",()=>createOwnHitShare("9005",now));
      const before=getLeaderboard(now);
      const foreign=runAsOwner("foreign",()=>setOwnHitLeaderboardOptIn(share.publicId,true));
      const opted=runAsOwner("owner",()=>setOwnHitLeaderboardOptIn(share.publicId,true));
      const after=getLeaderboard(now);
      const sql=new Database(process.env.ISPATLA_DB);
      sql.query("UPDATE evaluation_outcome_revisions SET followers_count=NULL WHERE provenance_ref LIKE '%:9005:%'").run();
      const missingFollowers=getLeaderboard(now);
      sql.query("UPDATE evaluation_outcome_revisions SET followers_count=1000,followers_observed_at=observed_at+1 WHERE provenance_ref LIKE '%:9005:%'").run();
      const mismatchedTime=getLeaderboard(now);
      sql.query("UPDATE evaluation_outcome_revisions SET followers_observed_at=observed_at WHERE provenance_ref LIKE '%:9005:%'").run();
      sql.query("UPDATE evaluation_outcome_revisions SET followers_x_user_id='999' WHERE provenance_ref LIKE '%:9005:%'").run();
      const mismatch=getLeaderboard(now);
      sql.query("UPDATE evaluation_outcome_revisions SET followers_x_user_id='12345' WHERE provenance_ref LIKE '%:9005:%'").run();
      let rejected=false;try{runAsOwner("owner",()=>setHitEvidenceExcluded(share.publicId,true,"spam"));}catch{rejected=true;}
      runAsOwner("operator",()=>setHitEvidenceExcluded(share.publicId,true,"suspected coordinated engagement",now));
      const flagged=getLeaderboard(now);
      runAsOwner("owner",()=>revokeOwnHitShare(share.publicId,now+1));
      const replacement=runAsOwner("owner",()=>createOwnHitShare("9005",now+2));
      runAsOwner("owner",()=>setOwnHitLeaderboardOptIn(replacement.publicId,true));
      const persistent=getLeaderboard(now);
      runAsOwner("operator",()=>setHitEvidenceExcluded(replacement.publicId,false,"",now));
      const cleared=getLeaderboard(now);
      runAsOwner("owner",()=>setOwnHitLeaderboardOptIn(replacement.publicId,false));
      const optedOut=getLeaderboard(now);
      runAsOwner("owner",()=>setOwnHitLeaderboardOptIn(replacement.publicId,true));
      runAsOwner("owner",()=>revokeOwnHitShare(replacement.publicId,now+3));
      const revoked=getLeaderboard(now);
      console.log(JSON.stringify({share,before,foreign,opted,after,missingFollowers,mismatchedTime,mismatch,rejected,flagged,persistent,cleared,optedOut,revoked}));
    `;
    const result = Bun.spawnSync({ cmd: [process.execPath,"-e",script], cwd: process.cwd(), env: { ...process.env,ISPATLA_DB:join(directory,"state.sqlite3"),ISPATLA_DEMO:"0",ISPATLA_OPERATOR_USER_ID:"operator",ISPATLA_SECRET_KEY:"test-vault",ISPATLA_TOKEN_KEY_CURRENT:"test-token",X_OAUTH_CLIENT_ID:"fixture",X_OAUTH_CLIENT_SECRET:"fixture-secret",X_OAUTH_REDIRECT_URI:"http://localhost:3000/api/x/oauth/callback" },stdout:"pipe",stderr:"pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const data = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(data.share.leaderboardOptIn).toBe(false);
    expect(data.before.week).toEqual([]);expect(data.foreign).toBe(false);expect(data.opted).toBe(true);
    expect(data.after.week).toHaveLength(1);expect(data.after.week[0].relativePerformance).toBe(4);
    expect(JSON.stringify(data.after)).not.toContain("private baseline");expect(JSON.stringify(data.after)).not.toContain("private-token");
    expect(data.missingFollowers.week).toEqual([]);expect(data.mismatchedTime.week).toEqual([]);expect(data.mismatch.week).toEqual([]);expect(data.rejected).toBe(true);expect(data.flagged.week).toEqual([]);
    expect(data.persistent.week).toEqual([]);expect(data.cleared.week).toHaveLength(1);
    expect(data.optedOut.week).toEqual([]);expect(data.revoked.week).toEqual([]);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
