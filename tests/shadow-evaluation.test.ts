import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function isolated(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-shadow-eval-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script], cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_DEMO: "1", ISPATLA_SECRET_KEY: "shadow-test-vault-key", ISPATLA_TOKEN_KEY_CURRENT: "shadow-test-token-key", X_OAUTH_CLIENT_ID:"shadow-client", X_OAUTH_CLIENT_SECRET:"shadow-secret", X_OAUTH_REDIRECT_URI:"http://localhost:3000/api/x/oauth/callback" },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("pipeline records Observe rejections per owner without creating drafts or publication writes", () => {
  const result = JSON.parse(isolated(`
    import { Database } from "bun:sqlite";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { ensureDatabase, getCategories, getDrafts, saveAccount, saveSourceCategoryConfig, setSetting, upsertPost, upsertSource } from "./src/server/db.ts";
    import { demoPosts } from "./src/server/fixture-x.ts";
    import { observedPost, scanOnce } from "./src/server/pipeline.ts";
    if (!ensureDatabase()) throw new Error("db unavailable");
    const now = Math.floor(Date.now() / 1000);
    (demoPosts as any[]).push({ ...demoPosts[0], id:"shadow-below-threshold", url:"https://x.com/demo_source/status/shadow-below-threshold", text:"low signal", createdAt:now-60, metrics:{likes:0,replies:0,reposts:0,quotes:null,views:null,pollVotes:null,capturedAt:now,quality:"partial"} });
    runAsOwner("observe-owner", () => saveAccount({ accountKey:"observe",handle:"observe",displayName:"Observe",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now }));
    upsertSource({handle:"demo_source",name:"Demo source",enabled:true,maxPosts:20,rightsStatus:"unknown",profile:{origin:"manual",status:"active"}},now);
    const category = getCategories()[0];
    saveSourceCategoryConfig({sourceHandle:"demo_source",categoryId:category.id,monitoringTier:"B",discoveryWeight:1,categoryReputation:null,enabled:true,lastEvidenceAt:now});
    setSetting("jev_mode","off",now); setSetting("ai_enabled","0",now);
    const xPost = { id:"shadow-candidate",url:"https://x.com/demo_source/status/shadow-candidate",text:"A synthetic high-signal candidate for Observe shadow ingestion.",createdAt:now-60,author:{handle:"demo_source",name:"Demo source",bio:"",avatarUrl:"",followers:100000,following:1,statuses:10,likes:0,mediaCount:0,verification:"unknown"},metrics:{likes:100000,replies:10000,reposts:5000,quotes:1000,views:1000000,pollVotes:null,capturedAt:now,quality:"ok"},media:[],sensitive:false,discovery:{quoteAuthor:"",replyTo:"",mentions:[]} };
    upsertPost(observedPost("demo_source",xPost),now);
    await scanOnce();
    const db = new Database(process.env.ISPATLA_DB);
    const decisions = db.query("SELECT owner_user_id,account_id,candidate_id,raw_score,selection_propensity,action,category,format,risk_tier,features_json FROM evaluation_predictions").all();
    const writes = {drafts:getDrafts(100).length,intents:db.query("SELECT COUNT(*) count FROM publication_intents").get().count,publishes:db.query("SELECT COUNT(*) count FROM publish_attempts").get().count};
    console.log(JSON.stringify({decisions,writes}));
  `));
  expect(result.decisions.length).toBeGreaterThan(0);
  expect(result.decisions.every((row: { owner_user_id:string; risk_tier:string; selection_propensity:number|null; raw_score:number; features_json:string }) => row.owner_user_id === "observe-owner" && row.risk_tier === "unknown" && row.selection_propensity === null && Number.isFinite(row.raw_score) && JSON.parse(row.features_json).decision !== "eligible")).toBe(true);
  const reasons = result.decisions.map((row: { features_json:string }) => JSON.parse(row.features_json).reason);
  expect(reasons).toContain("below_opportunity_pool_threshold");
  expect(reasons).toContain("stale_or_future_candidate");
  expect(result.writes).toEqual({ drafts: 0, intents: 0, publishes: 0 });
});

test.each([
  {name:"official followers",age:16*86400,profile:"valid"},
  {name:"missing followers",age:16*86400,profile:"missing"},
  {name:"wrong profile identity",age:16*86400,profile:"foreign"},
  {name:"unavailable profile",age:16*86400,profile:"failed"},
  {name:"day observation followed by resolved observation",age:25*3600,profile:"valid"},
])("official outcomes preserve owner, censored metrics and $name", async ({age,profile}) => {
  const result = JSON.parse(isolated(`
    process.env.ISPATLA_DEMO="0";
    import { Database } from "bun:sqlite";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { ensureDatabase, createDraft, createPublicationIntent, createPublicationApproval, updatePublicationIntent, recordFeedbackSnapshot, saveAccount } from "./src/server/db.ts";
    import { connectXAccount } from "./src/server/x-oauth-store.ts";
    import { collectDueShadowOutcomes, recordShadowDecision } from "./src/server/shadow-evaluation.ts";
    import { appendObservedOutcome, adjudicateEvaluationPrediction, listEvaluationOutcomes, listDueUnresolvedPredictions, splitLeakageGroup } from "./src/server/evaluation-store.ts";
    ensureDatabase();
    const now=Math.floor(Date.now()/1000), createdAt=now-${age}, confirmedAt=createdAt+200;
    const accountA=connectXAccount({ownerUserId:"owner-a",xUserId:"501001",handle:"owner_a",displayName:"Owner A",accessToken:"fixture-access",refreshToken:"fixture-refresh",expiresAt:9999999999,scopes:["tweet.read","tweet.write","users.read","media.write","offline.access"],now:createdAt}).accountId;
    const accountB=runAsOwner("owner-b",()=>saveAccount({accountKey:"owner-b",handle:"owner_b",displayName:"Owner B",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:createdAt}));
    const post={externalId:"source-post",clusterKey:"event-group",sourceHandle:"source",createdTimestamp:createdAt-5,score:75,scoreReason:"deterministic:{}",sensitive:false};
    const historyGroup=Array.from({length:100},(_,i)=>"history-"+i).find(group=>splitLeakageGroup(group)!=="holdout");
    const historical=runAsOwner("owner-a",()=>recordShadowDecision({post:{...post,externalId:"history-post",clusterKey:historyGroup},account:{id:accountA,ownerUserId:"owner-a"} as never,score:50,category:"technology",decision:"rejected",reason:"history",createdAt:createdAt-2}));
    runAsOwner("owner-a",()=>adjudicateEvaluationPrediction({predictionId:historical.id,label:"hit",reviewerRef:"fixture-review",labeledAt:createdAt-1}));
    for (let i=0;i<${profile==="valid"&&age>14*86400?505:5};i++) runAsOwner("owner-a",()=>recordShadowDecision({post:{...post,externalId:"reject-"+i,clusterKey:"reject-group-"+i},account:{id:accountA,ownerUserId:"owner-a"} as never,score:1,category:"technology",decision:"rejected",reason:"fixture rejection",createdAt:createdAt-10}));
    const ownedPrediction=runAsOwner("owner-a",()=>recordShadowDecision({post,account:{id:accountA,ownerUserId:"owner-a"} as never,score:75,category:"technology",decision:"eligible",reason:"pass",createdAt}));
    runAsOwner("owner-a",()=>recordShadowDecision({post:{...post,externalId:"source-post-2",clusterKey:"event-group-2"},account:{id:accountA,ownerUserId:"owner-a"} as never,score:75,category:"technology",decision:"eligible",reason:"pass",createdAt}));
    const foreignPrediction=runAsOwner("owner-b",()=>recordShadowDecision({post,account:{...accountB,ownerUserId:"owner-b"} as never,score:75,category:"technology",decision:"eligible",reason:"pass",createdAt}));
    runAsOwner("owner-a",()=>{
      const draft=createDraft({externalId:"source-post",accountId:accountA,format:"post",text:"fixture publication",sourceHandle:"source",now:createdAt});
      const intent=createPublicationIntent({draftId:draft.id,accountId:accountA,idempotencyKey:"shadow-intent",text:"fixture publication",now:createdAt});
      createPublicationApproval({id:intent.id,now:createdAt+100});
      new Database(process.env.ISPATLA_DB).query("UPDATE drafts SET external_id='edited-after-approval' WHERE id=?").run(draft.id);
      updatePublicationIntent({id:intent.id,status:"confirmed",receipt:JSON.stringify({id:"900001"}),remoteUrl:"https://x.com/owner_a/status/900001",confirmedAt,now:confirmedAt});
      const secondDraft=createDraft({externalId:"source-post-2",accountId:accountA,format:"post",text:"second fixture publication",sourceHandle:"source",now:createdAt});
      const secondIntent=createPublicationIntent({draftId:secondDraft.id,accountId:accountA,idempotencyKey:"shadow-intent-2",text:"second fixture publication",now:createdAt});
      createPublicationApproval({id:secondIntent.id,now:createdAt+100});
      updatePublicationIntent({id:secondIntent.id,status:"confirmed",receipt:JSON.stringify({id:"900002"}),remoteUrl:"https://x.com/owner_a/status/900002",confirmedAt,now:confirmedAt});
      recordFeedbackSnapshot({externalId:"source-post",accountId:accountA,likes:0,replies:0,reposts:0,quotes:0,views:0,milestone:"5dk",now:confirmedAt+100});
    });
    const calls=[];
    let profileReads=0;
    const client={getOwnProfile:async(credential)=>{profileReads++;if("${profile}"==="failed")throw new Error("denied");return {id:"${profile}"==="foreign"?"501002":credential.xUserId,public_metrics:"${profile}"==="missing"?{}:{followers_count:120}};},getPost:async (credential,id)=>{calls.push([credential.xUserId,id]);return {id,author_id:credential.xUserId,created_at:new Date((createdAt+10)*1000).toISOString(),public_metrics:{like_count:0,reply_count:2,retweet_count:1,quote_count:0}};}};
    const collected=await collectDueShadowOutcomes(now,client);
    const outcomes=runAsOwner("owner-a",()=>listEvaluationOutcomes(ownedPrediction.id));
    const foreignOutcomes=runAsOwner("owner-b",()=>listEvaluationOutcomes(foreignPrediction.id));
    let invalidRejected=false,foreignRejected=false;
    try {runAsOwner("owner-a",()=>appendObservedOutcome({predictionId:ownedPrediction.id,capturedAt:now+1,observedAt:now+1,metrics:outcomes[0].metrics,source:"official_x_api",provenanceRef:"fixture",followersEvidence:{count:120,observedAt:now+1,xUserId:"501002",provenanceRef:"official_x_user:"+accountA+":501002"}}));} catch {invalidRejected=true;}
    try {runAsOwner("owner-b",()=>appendObservedOutcome({predictionId:ownedPrediction.id,capturedAt:now+1,observedAt:now+1,metrics:outcomes[0].metrics,source:"official_x_api",provenanceRef:"fixture"}));} catch {foreignRejected=true;}
    const refreshed=${age}<86400*14?await collectDueShadowOutcomes(now+14*86400,client):null;
    const allOutcomes=runAsOwner("owner-a",()=>listEvaluationOutcomes(ownedPrediction.id));
    const repeat=await collectDueShadowOutcomes(now+14*86400,client);
    console.log(JSON.stringify({invalidRejected,foreignRejected,collected,calls,outcomes,allOutcomes,refreshed,repeat,profileReads,foreignOutcomes,features:ownedPrediction.features,accountA,now}));
  `));
  expect(result.collected).toMatchObject({ checked: 2, collected: 2, unresolved: 0, failed: 0 });
  expect(result.calls.length).toBe(age<14*86400?4:2);
  expect(result.calls.every((call:string[])=>call[0]==="501001")).toBe(true);
  expect([...new Set(result.calls.map((call:string[])=>call[1]))].sort()).toEqual(["900001","900002"]);
  expect(result.profileReads).toBe(age<14*86400?2:1);
  expect(result.outcomes[0].followersEvidence).toEqual(profile==="valid"?{count:120,observedAt:result.now,xUserId:"501001",provenanceRef:`official_x_user:${result.accountA}:501001`}:null);
  expect(result.invalidRejected).toBe(true);expect(result.foreignRejected).toBe(true);
  expect(result.repeat.collected).toBe(0);
  if(age<14*86400){expect(result.refreshed.collected).toBe(2);expect(result.allOutcomes.length).toBe(2);}
  expect(result.outcomes[0]).toMatchObject({ source: "official_x_api", metrics: { views: null, likes: 0, replies: 2, reposts: 1, quotes: 0 }, censored: ["views"] });
  expect(result.foreignOutcomes).toEqual([]);
  expect(result.features).toMatchObject({ sourceCandidateId: "source-post", accountBaseline: 50, accountResidual: 25, accountPercentile: 1, baselineSampleCount: 1 });
}, 30000);
