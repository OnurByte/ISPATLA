import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runIsolated(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-official-queue-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script], cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"),
        ISPATLA_SECRET_KEY: "test-secret-key-for-official-queue-123456789", ISPATLA_AUTOMATION: "1",
        X_OAUTH_CLIENT_ID: "fixture-client", X_OAUTH_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback" },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

const setup = `
  import { ensureDatabase, createDraft, createJob, claimAutomationJobLease, markAutomationJobRequestSent, finishAutomationJobLease, claimAccountDispatchLease, releaseAccountDispatchLease, getAccounts, getJob, getDraft, getAutomationJobEvents, saveAccount, updateDraft } from "./src/server/db.ts";
  import { connectXAccount, disconnectXAccount, getXAccountAuthState, setAutomationConsent } from "./src/server/x-oauth-store.ts";
  import { runAsOwner } from "./src/server/owner-context.ts";
  import { queueDraftIds, runAutomationJob, reconcileAutomationJobs } from "./src/server/queue-service.ts";
  import { X_POLICY_VERSION, X_CONSENT_COPY_VERSION } from "./src/server/x-policy.ts";
  import { OfficialXClient, OfficialXError } from "./src/server/official-x.ts";
  if (!ensureDatabase()) throw new Error("database unavailable");
  const now = Math.floor(Date.now()/1000);
  const scopes=["tweet.read","tweet.write","users.read","media.write","offline.access"];
  let index=0;
  function makeJob(action="repost", owner="owner-a", expiresAt=now+7200) {
    const handle="owner"+(index++).toString(36)+now.toString(36).slice(-6);
    const linked=connectXAccount({ownerUserId:owner,xUserId:String(900000+index),handle,displayName:"Fixture",accessToken:"fixture-access",refreshToken:"fixture-refresh",expiresAt,scopes,now});
    let account=runAsOwner(owner,()=>getAccounts().find(row=>row.id===linked.accountId)!);
    account=runAsOwner(owner,()=>saveAccount({id:account.id,accountKey:account.accountKey,handle:account.handle,displayName:account.displayName,enabled:true,defaultAccount:account.defaultAccount,automationMode:"manual",dailyLimit:account.dailyLimit,capabilities:account.capabilities,styleProfile:account.styleProfile,now}));
    setAutomationConsent({accountId:account.id,ownerUserId:owner,action,mode:"assist",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:1,now});
    const draft=runAsOwner(owner,()=>createDraft({externalId:"",accountId:account.id,format:action,text:action==="repost"?"":"A distinct, reviewed post for the official queue fixture.",status:"ready",sourceUrl:action==="repost"?"https://x.com/source/status/81234001":"",now}));
    const job=runAsOwner(owner,()=>{
      if(action==="post") { const created=createJob({draftId:draft.id,accountId:account.id,action,scheduledAt:now,now}); updateDraft({id:draft.id,status:"queued",now}); return created; }
      return queueDraftIds([draft.id],now).jobs[0];
    });
    return {owner,account,draft,job};
  }
  function fixtureClient(send) { return {createPost:send,repost:send} as unknown as OfficialXClient; }
  function makeSameAccountPost(item,suffix) {
    const draft=runAsOwner(item.owner,()=>createDraft({externalId:"",accountId:item.account.id,format:"post",text:"A separate queue post "+suffix+" with enough original text.",status:"ready",now}));
    const job=runAsOwner(item.owner,()=>{const created=createJob({draftId:draft.id,accountId:item.account.id,action:"post",scheduledAt:now,now});updateDraft({id:draft.id,status:"queued",now});return created;});
    return {...item,draft,job};
  }
  function makeAcceptedReply(item,targetId,remoteId) {
    const version=getXAccountAuthState(item.account.id,item.owner).consents.find(row=>row.action==="reply").version;
    setAutomationConsent({accountId:item.account.id,ownerUserId:item.owner,action:"reply",mode:"assist",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:version,now});
    const draft=runAsOwner(item.owner,()=>createDraft({externalId:"",accountId:item.account.id,format:"reply",text:"An approved reply with its original author target.",status:"queued",sourceUrl:"https://x.com/source/status/"+targetId,now}));
    const job=runAsOwner(item.owner,()=>createJob({draftId:draft.id,accountId:item.account.id,action:"reply",scheduledAt:now,now}));
    const accountLease=runAsOwner(item.owner,()=>claimAccountDispatchLease({accountId:item.account.id,now}));
    const lease=runAsOwner(item.owner,()=>claimAutomationJobLease({id:job.id,now}));
    if(!accountLease||!lease||!runAsOwner(item.owner,()=>markAutomationJobRequestSent({id:job.id,leaseToken:lease.leaseToken,accountLeaseToken:accountLease.leaseToken,now})))throw new Error("synthetic reply lease failed");
    runAsOwner(item.owner,()=>finishAutomationJobLease({id:job.id,leaseToken:lease.leaseToken,accountLeaseToken:accountLease.leaseToken,outcome:"accepted",receipt:JSON.stringify({id:remoteId,text:draft.text}),now}));
    runAsOwner(item.owner,()=>releaseAccountDispatchLease({...accountLease,now}));
    return {...item,draft,job};
  }
`;

test("queued repost uses the account's official OAuth identity and waits for reconciliation", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item=makeJob(); let sent;
    const client=fixtureClient(async (credentials,target)=>{sent={xUserId:credentials.xUserId,token:credentials.accessToken,target};return {id:"81234002",text:""};});
    const outcome=await runAutomationJob(item.job.id,now,client);
    console.log(JSON.stringify({ok:outcome.ok,status:outcome.job?.status,receipt:outcome.job?.receipt,sent,events:getAutomationJobEvents(item.job.id).map(row=>row.event)}));
  `));
  expect(result.ok).toBe(true);
  expect(result.status).toBe("pending_reconciliation");
  expect(result.receipt).toContain("81234002");
  expect(result.sent).toMatchObject({ xUserId: "900001", token: "fixture-access", target: "81234001" });
  expect(result.events.filter((event: string) => event === "request_sent")).toHaveLength(1);
});

test("a lost write response is quarantined and cannot be intentionally sent twice", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item=makeJob("post"); let sends=0;
    const client=fixtureClient(async()=>{sends++;throw new OfficialXError({code:"unknown_remote_state",message:"connection lost",safeToRetry:false,remoteStateKnown:false});});
    const first=await runAutomationJob(item.job.id,now,client); let second="";
    try { await runAutomationJob(item.job.id,now+1,client); } catch(error) { second=error instanceof Error?error.message:String(error); }
    const job=getJob(item.job.id);
    console.log(JSON.stringify({status:job?.status,sends,second,sent:getAutomationJobEvents(item.job.id).filter(row=>row.event==="request_sent").length}));
  `));
  expect(result.status).toBe("reconciliation_required");
  expect(result.sends).toBe(1);
  expect(result.sent).toBe(1);
});

test("concurrent workers cannot dispatch one queued action twice", async () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item=makeJob("post"); let sends=0,release;
    const held=new Promise(resolve=>release=resolve);
    const client=fixtureClient(async(_credentials,input)=>{sends++;await held;return {id:"81234003",text:input?.text||""};});
    const first=runAutomationJob(item.job.id,now,client); await new Promise(resolve=>setTimeout(resolve,25));
    let second=""; try { await runAutomationJob(item.job.id,now,client); } catch(error) { second=error instanceof Error?error.message:String(error); }
    release(); const accepted=await first;
    console.log(JSON.stringify({status:accepted.job?.status,sends,second,sent:getAutomationJobEvents(item.job.id).filter(row=>row.event==="request_sent").length}));
  `));
  expect(result.status).toBe("pending_reconciliation");
  expect(result.sends).toBe(1);
  expect(result.sent).toBe(1);
});

test("revocation during a fixture token refresh stops before the X write", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item=makeJob("post","revoke-owner",now+30); let writes=0,refreshes=0;
    globalThis.fetch=async(input)=>{refreshes++;disconnectXAccount({accountId:item.account.id,ownerUserId:item.owner,now});return new Response(JSON.stringify({access_token:"new-access",refresh_token:"new-refresh",expires_in:7200,scope:scopes.join(" ")}),{status:200,headers:{"content-type":"application/json"}});};
    const client=fixtureClient(async()=>{writes++;return {id:"81234004",text:"fixture"};});
    const outcome=await runAutomationJob(item.job.id,now,client);
    console.log(JSON.stringify({ok:outcome.ok,status:getJob(item.job.id)?.status,writes,refreshes,connected:getXAccountAuthState(item.account.id,item.owner)?.connected,requestSent:getAutomationJobEvents(item.job.id).some(row=>row.event==="request_sent")}));
  `));
  expect(result.writes).toBe(0);
  expect(result.refreshes).toBe(1);
  expect(result.connected).toBe(false);
  expect(result.requestSent).toBe(false);
});

test("jobs are owner-bound and the worker client has no like or DM write methods", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item=makeJob("repost","actual-owner"); let writes=0;
    const client=fixtureClient(async()=>{writes++;return {id:"81234005",text:""};}); let crossOwner="";
    try { await runAsOwner("other-owner",()=>runAutomationJob(item.job.id,now,client)); } catch(error) { crossOwner=error instanceof Error?error.message:String(error); }
    console.log(JSON.stringify({crossOwner,writes,like:typeof (client as any).like,dm:typeof (client as any).sendDirectMessage,ownerVisible:runAsOwner(item.owner,()=>Boolean(getJob(item.job.id)))}));
  `));
  expect(result.crossOwner).toContain("job bulunamadı");
  expect(result.writes).toBe(0);
  expect(result.like).toBe("undefined");
  expect(result.dm).toBe("undefined");
  expect(result.ownerVisible).toBe(true);
});

test("human-approved Assist posts serialize on one account without requiring earned autonomy", async () => {
  const result=JSON.parse(runIsolated(`${setup}
    const first=makeJob("post","shared-auto");
    const second=makeSameAccountPost(first,"second-post");let sends=0,release;
    const held=new Promise(resolve=>release=resolve);
    const client=fixtureClient(async(_credential,input)=>{sends++;await held;return {id:"81234990",text:input.text};});
    const a=runAutomationJob(first.job.id,now,client);await new Promise(resolve=>setTimeout(resolve,30));
    const b=await runAutomationJob(second.job.id,now,client);release();const accepted=await a;
    console.log(JSON.stringify({first:accepted.job?.status,whileHeld:b.job?.status,whileReason:b.reason,sends}));
  `));
  expect(result.first).toBe("pending_reconciliation");
  expect(result.sends).toBe(1);
  expect(result.whileHeld).toBe("queued");
  expect(result.whileReason).toContain("account dispatch already reserved");
});

test("Assist changing to Off during token refresh is rechecked before the write marker", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeJob("post","assist-off",now+30);
    setAutomationConsent({accountId:item.account.id,ownerUserId:item.owner,action:"post",mode:"assist",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:2,now});
    saveAccount({id:item.account.id,accountKey:item.account.accountKey,handle:item.account.handle,displayName:item.account.displayName,enabled:true,defaultAccount:item.account.defaultAccount,automationMode:"manual",dailyLimit:item.account.dailyLimit,capabilities:item.account.capabilities,styleProfile:item.account.styleProfile,now});
    let sends=0,refreshes=0;
    globalThis.fetch=async()=>{refreshes++;setAutomationConsent({accountId:item.account.id,ownerUserId:item.owner,action:"post",mode:"off",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:3,now});return new Response(JSON.stringify({access_token:"new-access",refresh_token:"new-refresh",expires_in:7200,scope:scopes.join(" ")}),{status:200,headers:{"content-type":"application/json"}});};
    const outcome=await runAutomationJob(item.job.id,now,fixtureClient(async()=>{sends++;return {id:"1",text:"sent"};}));
    console.log(JSON.stringify({status:getJob(item.job.id)?.status,sends,refreshes,sent:getAutomationJobEvents(item.job.id).some(row=>row.event==="request_sent"),consent:getXAccountAuthState(item.account.id,item.owner)?.consents.find(row=>row.action==="post")?.mode}));
  `));
  expect(result.refreshes).toBe(1);
  expect(result.sends).toBe(0);
  expect(result.sent).toBe(false);
  expect(result.consent).toBe("off");
});

test("a 401 disables the connected account so the next queued job does not reach the client", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const first=makeJob("post","reauth-queue");let sends=0;
    const client=fixtureClient(async()=>{sends++;throw new OfficialXError({code:"reauth",message:"reconnect",safeToRetry:false,remoteStateKnown:true});});
    await runAutomationJob(first.job.id,now,client);
    const second=makeSameAccountPost(first,"after-401");
    const next=await runAutomationJob(second.job.id,now+1,fixtureClient(async()=>{sends++;return {id:"2",text:"should not send"};}));
    console.log(JSON.stringify({connected:getXAccountAuthState(first.account.id,first.owner)?.connected,sends,next:next.job?.status,reason:next.reason}));
  `));
  expect(result.connected).toBe(false);
  expect(result.sends).toBe(1);
  expect(result.next).toBe("blocked");
});

test("post receipt reconciles only exact authenticated owner, text, and bounded-time evidence", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeJob("post","reconcile-post");
    const dispatched=await runAutomationJob(item.job.id,now,fixtureClient(async(_credential,input)=>({id:"81234991",text:input.text})));
    const client={getPost:async(_credential,id)=>({id,author_id:"900001",text:item.draft.text,created_at:new Date((getJob(item.job.id).remoteWriteStartedAt)*1000).toISOString()}),getOwnTimeline:async()=>[]};
    const count=await reconcileAutomationJobs(10,{client:client as unknown as OfficialXClient,now:()=>now+1});
    console.log(JSON.stringify({dispatch:dispatched.job?.status,count,final:getJob(item.job.id)?.status,draft:getDraft(item.draft.id)?.status}));
  `));
  expect(result.dispatch).toBe("pending_reconciliation");
  expect(result.count).toBe(1);
  expect(result.final).toBe("confirmed");
  expect(result.draft).toBe("confirmed");
});

test("missing post receipt reconciles only one exact own-timeline candidate in the send window", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeJob("post","timeline-reconcile");
    await runAutomationJob(item.job.id,now,fixtureClient(async()=>{throw new OfficialXError({code:"unknown_remote_state",message:"lost",safeToRetry:false,remoteStateKnown:false});}));
    const sentAt=getJob(item.job.id).remoteWriteStartedAt;
    const candidate={id:"81234992",author_id:"900001",text:item.draft.text,created_at:new Date(sentAt*1000).toISOString()};
    const client={getPost:async()=>null,getOwnTimeline:async()=>[candidate]};
    const count=await reconcileAutomationJobs(10,{client:client as unknown as OfficialXClient,now:()=>now+1});
    console.log(JSON.stringify({count,status:getJob(item.job.id)?.status,receipt:getJob(item.job.id)?.receipt}));
  `));
  expect(result.count).toBe(1);
  expect(result.status).toBe("confirmed");
  expect(result.receipt).toContain("81234992");
});

test("ambiguous own-timeline matches remain manual instead of confirming", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeJob("post","ambiguous-timeline");
    await runAutomationJob(item.job.id,now,fixtureClient(async(_credential,input)=>({id:"81234995",text:input.text})));
    const sentAt=getJob(item.job.id).remoteWriteStartedAt;
    const candidate={author_id:"900001",text:item.draft.text,created_at:new Date(sentAt*1000).toISOString()};
    const client={getPost:async()=>null,getOwnTimeline:async()=>[{...candidate,id:"81234993"},{...candidate,id:"81234994"}]};
    const count=await reconcileAutomationJobs(10,{client:client as unknown as OfficialXClient,now:()=>now+1});
    console.log(JSON.stringify({count,status:getJob(item.job.id)?.status,reason:getJob(item.job.id)?.reason}));
  `));
  expect(result.count).toBe(0);
  expect(result.status).toBe("reconciliation_required");
  expect(result.reason).toContain("multiple exact timeline candidates");
});

test("reply reconciliation requires its exact referenced target as well as owner, text, and time", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const base=makeJob("post","reply-target-check");
    const item=makeAcceptedReply(base,"81234001","81234996");
    const good=makeAcceptedReply(base,"81234001","81234997");
    const sentAt=getJob(item.job.id).remoteWriteStartedAt;
    const post={id:"81234996",author_id:"900001",text:item.draft.text,created_at:new Date(sentAt*1000).toISOString(),referenced_tweets:[{type:"replied_to",id:"81234002"}]};
    const goodSentAt=getJob(good.job.id).remoteWriteStartedAt;
    const valid={id:"81234997",author_id:"900001",text:good.draft.text,created_at:new Date(goodSentAt*1000).toISOString(),referenced_tweets:[{type:"replied_to",id:"81234001"}]};
    const client={getPost:async(_credential,id)=>id==="81234996"?post:valid,getOwnTimeline:async()=>[]};
    const count=await reconcileAutomationJobs(10,{client:client as unknown as OfficialXClient,now:()=>now+1});
    console.log(JSON.stringify({count,status:getJob(item.job.id)?.status,reason:getJob(item.job.id)?.reason,good:getJob(good.job.id)?.status}));
  `));
  expect(result.count).toBe(1);
  expect(result.status).toBe("reconciliation_required");
  expect(result.reason).toContain("no unique authenticated post evidence");
  expect(result.good).toBe("confirmed");
});

test("repost reconciliation needs a positive authenticated-user result and keeps rate limits pending", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeJob("repost","reconcile-repost");
    await runAutomationJob(item.job.id,now,fixtureClient(async()=>({reposted:true})));
    let count=await reconcileAutomationJobs(10,{client:{getRepostedBy:async()=>({userIds:["900001"],complete:true})} as unknown as OfficialXClient,now:()=>now+1});
    const confirmed=getJob(item.job.id)?.status;
    const second=makeJob("repost","reconcile-rate-limit");
    await runAutomationJob(second.job.id,now,fixtureClient(async()=>({reposted:true})));
    const rateClient={getRepostedBy:async()=>{throw new OfficialXError({code:"rate_limited",message:"wait",safeToRetry:false,remoteStateKnown:true,retryAfter:"30"});}} as unknown as OfficialXClient;
    await reconcileAutomationJobs(10,{client:rateClient,now:()=>now+1});
    console.log(JSON.stringify({count,confirmed,rateStatus:getJob(second.job.id)?.status,rateReason:getJob(second.job.id)?.reason}));
  `));
  expect(result.count).toBe(1);
  expect(result.confirmed).toBe("confirmed");
  expect(result.rateStatus).toBe("pending_reconciliation");
});

test("a complete repost lookup without the authenticated user becomes manual unknown, never confirmed", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeJob("repost","reconcile-repost-negative");
    await runAutomationJob(item.job.id,now,fixtureClient(async()=>({reposted:true})));
    const count=await reconcileAutomationJobs(10,{client:{getRepostedBy:async()=>({userIds:["123456"],complete:true})} as unknown as OfficialXClient,now:()=>now+1});
    console.log(JSON.stringify({count,status:getJob(item.job.id)?.status,reason:getJob(item.job.id)?.reason}));
  `));
  expect(result.count).toBe(0);
  expect(result.status).toBe("reconciliation_required");
  expect(result.reason).toContain("did not confirm this account");
});

test("official author mention creates audited eligibility before a queued reply can write",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const item=makeJob("post");
  const version=getXAccountAuthState(item.account.id,item.owner).consents.find(row=>row.action==="reply").version;
  setAutomationConsent({accountId:item.account.id,ownerUserId:item.owner,action:"reply",mode:"assist",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:version,now});
  const draft=runAsOwner(item.owner,()=>createDraft({externalId:"",accountId:item.account.id,format:"reply",text:"An original answer to the author's question.",status:"queued",sourceUrl:"https://x.com/source/status/81234990",now}));
  const job=runAsOwner(item.owner,()=>createJob({draftId:draft.id,accountId:item.account.id,action:"reply",scheduledAt:now,now}));
  let reads=0,sends=0;
  const client={getPost:async(credentials,id)=>{reads++;return {id,author_id:"888881",entities:{mentions:[{id:credentials.xUserId}]}};},reply:async(credentials,input)=>{sends++;if(input.summonedBy!=="author_mention")throw Error("bad eligibility");return {id:"81234991",text:input.text};}} as unknown as OfficialXClient;
  const outcome=await runAsOwner(item.owner,()=>runAutomationJob(job.id,now,client));
  console.log(JSON.stringify({reads,sends,status:outcome.job.status}));
 `));
 expect(result).toEqual({reads:1,sends:1,status:"pending_reconciliation"});
});

test("queued source approval expires at claim and cannot cross a marker after the expiry race",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const first=makeJob("repost","queue-expiry-claim");
  const expiry=first.job.approvalExpiresAt;
  const missed=runAsOwner(first.owner,()=>claimAutomationJobLease({id:first.job.id,now:expiry}));
  const expired=getJob(first.job.id);
  const second=makeJob("repost","queue-expiry-marker");
  const secondExpiry=second.job.approvalExpiresAt;
  const lease=runAsOwner(second.owner,()=>claimAutomationJobLease({id:second.job.id,now:secondExpiry-1}));
  const marked=runAsOwner(second.owner,()=>markAutomationJobRequestSent({id:second.job.id,leaseToken:lease.leaseToken,now:secondExpiry}));
  console.log(JSON.stringify({missed,expired:expired.status,expiredEvent:getAutomationJobEvents(first.job.id).some(row=>row.event==="expired"),marked,secondStatus:getJob(second.job.id).status,remoteWriteStartedAt:getJob(second.job.id).remoteWriteStartedAt,secondExpiredEvent:getAutomationJobEvents(second.job.id).some(row=>row.event==="expired")}));
 `));
 expect(result.missed).toBeNull();
 expect(result.expired).toBe("expired");
 expect(result.expiredEvent).toBe(true);
 expect(result.marked).toBe(false);
 expect(result.secondStatus).toBe("expired");
 expect(result.remoteWriteStartedAt).toBeNull();
 expect(result.secondExpiredEvent).toBe(true);
});

test("an automatic queue approval downgraded to Assist cannot write",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const item=makeJob("post","automatic-downgrade");
  const draft=runAsOwner(item.owner,()=>createDraft({externalId:"",accountId:item.account.id,format:"post",text:"Automatic queue content stays worker-approved.",status:"queued",now}));
  const job=runAsOwner(item.owner,()=>createJob({draftId:draft.id,accountId:item.account.id,action:"post",scheduledAt:now,approvalSource:"automatic",now}));
  let sends=0;const outcome=await runAsOwner(item.owner,()=>runAutomationJob(job.id,now,fixtureClient(async()=>{sends++;return{id:"81234999",text:"sent"};})));
  console.log(JSON.stringify({status:outcome.job?.status,reason:outcome.reason,sends,requestSent:getAutomationJobEvents(job.id).some(row=>row.event==="request_sent")}));
 `));
 expect(result.status).toBe("blocked");
 expect(result.reason).toContain("human_approval_required");
 expect(result.sends).toBe(0);
 expect(result.requestSent).toBe(false);
});
