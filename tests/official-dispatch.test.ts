import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runIsolated(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-official-dispatch-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ISPATLA_DB: join(directory, "state.sqlite3"),
        ISPATLA_SECRET_KEY: "test-secret-key-for-official-dispatch-123456789",
        ISPATLA_AUTOMATION: "1",
        X_OAUTH_CLIENT_ID: "test-client-id",
        X_OAUTH_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const setup = `
  import { ensureDatabase, createDraft, updateDraft, deleteDraft, claimPublicationIntentLease, claimAccountDispatchLease, markPublicationIntentRequestSent, getAccounts, getPublicationIntent, getPublicationIntentEvents } from "./src/server/db.ts";
  import { runAsOwner } from "./src/server/owner-context.ts";
  import { approvePublicationIntent, cancelPublicationIntent, createIntentForDraft, dispatchPublicationIntent, reconcilePublicationIntents } from "./src/server/publication-service.ts";
  import { connectXAccount, disconnectXAccount, getXAccountAuthState, setAutomationConsent } from "./src/server/x-oauth-store.ts";
  import { X_POLICY_VERSION, X_CONSENT_COPY_VERSION } from "./src/server/x-policy.ts";
  import { OfficialXPublisher } from "./src/server/publisher.ts";
  import { OfficialXClient, OfficialXError } from "./src/server/official-x.ts";
  if (!ensureDatabase()) throw new Error("database unavailable");
  const { Database } = process.getBuiltinModule("bun:sqlite");
  const authDb = new Database(process.env.ISPATLA_DB);
  authDb.exec("CREATE TABLE auth_user_status(owner_user_id TEXT PRIMARY KEY,status TEXT NOT NULL,updated_at INTEGER NOT NULL)");
  authDb.close();
  const scopes = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
  const now = Math.floor(Date.now() / 1000);
  let handleCounter = 0;
  function makeIntent(suffix: string) {
    const owner = "dispatch-owner-" + suffix;
    const statusDb = new Database(process.env.ISPATLA_DB);
    statusDb.query("INSERT INTO auth_user_status(owner_user_id,status,updated_at) VALUES (?,'active',?)").run(owner, now);
    statusDb.close();
    const handle = "u" + (handleCounter++).toString(36) + now.toString(36).slice(-8);
    const connected = connectXAccount({ ownerUserId: owner, xUserId: String(700000 + Math.abs(suffix.length * 113 + now % 1000)), handle, displayName: "Owner", accessToken: "fixture-access-" + suffix, refreshToken: "fixture-refresh-" + suffix, expiresAt: now + 7200, scopes, now });
    const account = runAsOwner(owner, () => getAccounts().find((item) => item.id === connected.accountId)!);
    const draft = runAsOwner(owner, () => createDraft({ externalId: "", accountId: account.id, format: "post", text: "An approved official post for " + suffix, now }));
    const intent = runAsOwner(owner, () => createIntentForDraft(draft.id, account.id, now));
    runAsOwner(owner, () => approvePublicationIntent(intent.id, now));
    setAutomationConsent({ accountId: account.id, ownerUserId: owner, action: "post", mode: "assist", policyVersion: X_POLICY_VERSION, copyVersion: X_CONSENT_COPY_VERSION, dailyLimit: 0, cadenceSeconds: 0, expectedVersion: 1, now });
    return { owner, account, draft, intent };
  }
  function makeIntentOnAccount(item, suffix: string) {
    const draft = runAsOwner(item.owner, () => createDraft({ externalId: "", accountId: item.account.id,
      format: "post", text: "A separate approved post for " + suffix, now }));
    const intent = runAsOwner(item.owner, () => createIntentForDraft(draft.id, item.account.id, now));
    runAsOwner(item.owner, () => approvePublicationIntent(intent.id, now));
    return { ...item, draft, intent };
  }
  function grantAuto(item, dailyLimit: number, cadenceSeconds: number) {
    setAutomationConsent({ accountId: item.account.id, ownerUserId: item.owner, action: "post", mode: "auto",
      policyVersion: X_POLICY_VERSION, copyVersion: X_CONSENT_COPY_VERSION, dailyLimit, cadenceSeconds,
      expectedVersion: 2, now });
  }
  function fakePublisher(createPost: (credentials: { accessToken: string; xUserId: string }, input: { text: string }) => Promise<{ id: string; text: string }>) {
    const client = { createPost } as unknown as OfficialXClient;
    return new OfficialXPublisher(client);
  }
`;

test("lost official write response is quarantined and never intentionally dispatched twice", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("lost");
    let sends = 0;
    const publisher = fakePublisher(async () => { sends++; throw new OfficialXError({ code: "unknown_remote_state", message: "unknown", safeToRetry: false, remoteStateKnown: false }); });
    const first = await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now });
    let secondError = "";
    try { await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now + 1 }); } catch (error) { secondError = error instanceof Error ? error.message : String(error); }
    console.log(JSON.stringify({ status: first.status, secondError, sends, events: getPublicationIntentEvents(item.intent.id).map((event) => event.event) }));
  `));
  expect(result.status).toBe("reconciliation_required");
  expect(result.secondError).toContain("reconciliation_required");
  expect(result.sends).toBe(1);
  expect(result.events.filter((event: string) => event === "request_sent")).toHaveLength(1);
});

test("concurrent dispatches have one lease winner and one once-only request marker", async () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("race");
    let sends = 0;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const publisher = fakePublisher(async (_credential, input) => { sends++; await held; return { id: "800001", text: input.text }; });
    const first = dispatchPublicationIntent(item.intent.id, { publisher, now: () => now });
    for (let attempt = 0; attempt < 100 && sends === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (sends === 0) throw new Error("first dispatch did not reach publisher");
    let second = "";
    try { await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now }); } catch (error) { second = error instanceof Error ? error.message : String(error); }
    release();
    const accepted = await first;
    console.log(JSON.stringify({ status: accepted.status, second, sends, sentEvents: getPublicationIntentEvents(item.intent.id).filter((event) => event.event === "request_sent").length }));
  `));
  expect(result.status).toBe("pending_reconciliation");
  expect(result.second).toContain("dispatching");
  expect(result.sends).toBe(1);
  expect(result.sentEvents).toBe(1);
});

test("revoked account is rechecked immediately before send", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("revoked");
    let sends = 0;
    const publisher = fakePublisher(async (_credential, input) => { sends++; return { id: "800002", text: input.text }; });
    const final = await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now,
      beforeSend: () => disconnectXAccount({ accountId: item.account.id, ownerUserId: item.owner, now }) });
    console.log(JSON.stringify({ status: final.status, reason: final.reason, sends, state: getPublicationIntent(item.intent.id)?.status }));
  `));
  expect(result.status).toBe("dead_letter");
  expect(result.reason).toContain("revoked before send");
  expect(result.sends).toBe(0);
});

test("explicit rate limits schedule a delayed retry without sending again early", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("rate-limit");
    let sends = 0;
    const publisher = fakePublisher(async () => { sends++; throw new OfficialXError({ code: "rate_limited", message: "limited", safeToRetry: false, remoteStateKnown: true, retryAfter: "90" }); });
    const first = await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now });
    let early = "";
    try { await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now + 30 }); } catch (error) { early = error instanceof Error ? error.message : String(error); }
    console.log(JSON.stringify({ status: first.status, nextAttemptAt: first.nextAttemptAt, sends, early }));
  `));
  expect(result.status).toBe("approved");
  expect(result.nextAttemptAt).toBeGreaterThan(0);
  expect(result.sends).toBe(1);
  expect(result.early).toContain("lease unavailable");
});

test("401 reauthorization response is permanent for this dispatch and never retried", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("reauth");
    let sends = 0;
    const publisher = fakePublisher(async () => { sends++; throw new OfficialXError({ code: "reauth", message: "reauth", safeToRetry: false, remoteStateKnown: true }); });
    const final = await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now });
    const auth = getXAccountAuthState(item.account.id, item.owner);
    console.log(JSON.stringify({ status: final.status, errorClass: final.errorClass, sends, connected: auth?.connected, authState: auth?.authState }));
  `));
  expect(result.status).toBe("dead_letter");
  expect(result.errorClass).toBe("reauth");
  expect(result.sends).toBe(1);
  expect(result.connected).toBe(false);
  expect(result.authState).toBe("reauthorization_required");
});

test("pre-write failure schedules a safe retry without setting the once-only marker", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("prewrite");
    let sends = 0;
    const publisher = fakePublisher(async (_credential, input) => { sends++; return { id: "800005", text: input.text }; });
    const final = await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now, beforeSend: () => { throw new Error("fixture preflight error"); } });
    console.log(JSON.stringify({ status: final.status, remoteWriteStartedAt: final.remoteWriteStartedAt, sends, events: getPublicationIntentEvents(item.intent.id).map((event) => event.event) }));
  `));
  expect(result.status).toBe("approved");
  expect(result.remoteWriteStartedAt).toBeNull();
  expect(result.sends).toBe(0);
  expect(result.events).not.toContain("request_sent");
});

test("reconciliation confirms only exact post evidence by the persisted X identity", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("reconcile");
    const publisher = fakePublisher(async (_credential, input) => ({ id: "800003", text: input.text }));
    const dispatched = await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now });
    const reads = [];
    const client = {
      getPost: async (credential, id) => { reads.push({ token: credential.accessToken, xUserId: credential.xUserId, id }); return { id, author_id: credential.xUserId, text: dispatched.text }; },
    } as unknown as OfficialXClient;
    const confirmed = await reconcilePublicationIntents(10, { client, now: () => now + 1 });
    console.log(JSON.stringify({ dispatched: dispatched.status, confirmed, final: getPublicationIntent(item.intent.id)?.status, reads }));
  `));
  expect(result.dispatched).toBe("pending_reconciliation");
  expect(result.confirmed).toBe(1);
  expect(result.final).toBe("confirmed");
  expect(result.reads[0]).toMatchObject({ token: "fixture-access-reconcile", xUserId: expect.any(String), id: "800003" });
});

test("reconciliation ignores mismatched author or exact text", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("mismatch");
    const publisher = fakePublisher(async (_credential, input) => ({ id: "800004", text: input.text }));
    await dispatchPublicationIntent(item.intent.id, { publisher, now: () => now });
    let receiptReads = 0;
    const client = { getPost: async (credential, id) => { receiptReads++; return { id, author_id: "someone-else", text: "different" }; } } as unknown as OfficialXClient;
    const confirmed = await reconcilePublicationIntents(10, { client, now: () => now + 1 });
    console.log(JSON.stringify({ confirmed, status: getPublicationIntent(item.intent.id)?.status, receiptReads }));
  `));
  expect(result.confirmed).toBe(0);
  expect(result.status).toBe("reconciliation_required");
  expect(result.receiptReads).toBe(1);
});

test("a verified session owner cannot dispatch another owner's intent", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const item = makeIntent("owner-boundary");
    let message = "";
    try { await runAsOwner("attacker", () => dispatchPublicationIntent(item.intent.id)); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    console.log(JSON.stringify({ message, status: getPublicationIntent(item.intent.id)?.status }));
  `));
  expect(result.message).toContain("publication intent bulunamadı");
  expect(result.status).toBe("approved");
});

test("automatic posts fail closed without confirmed earned autonomy", async () => {
  const result = JSON.parse(runIsolated(`${setup}
    const firstItem=makeIntent("account-lease"); grantAuto(firstItem,1,1);
    let sends=0;
    const publisher=fakePublisher(async(_credential,input)=>{sends++;return {id:"800101",text:input.text};});
    const sent=await dispatchPublicationIntent(firstItem.intent.id,{publisher,now:()=>now});
    console.log(JSON.stringify({status:sent.status,sends,requestSent:getPublicationIntentEvents(firstItem.intent.id).some(row=>row.event==="request_sent")}));
  `));
  expect(result.status).toBe("dead_letter");
  expect(result.sends).toBe(0);
  expect(result.requestSent).toBe(false);
});

test("worker-generated Auto mode cannot substitute for a human approval or earned scope", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const firstItem=makeIntent("persisted-cadence"); grantAuto(firstItem,5,3600);
    const secondItem=makeIntentOnAccount(firstItem,"persisted-cadence-second"); let sends=0;
    const publisher=fakePublisher(async(_credential,input)=>{sends++;return {id:"800102",text:input.text};});
    const first=await dispatchPublicationIntent(firstItem.intent.id,{publisher,now:()=>now});
    const second=await dispatchPublicationIntent(secondItem.intent.id,{publisher,now:()=>now+1});
    console.log(JSON.stringify({first:first.status,second:second.status,reason:second.reason,sends}));
  `));
  expect(result.first).toBe("dead_letter");
  expect(result.second).toBe("dead_letter");
  expect(result.sends).toBe(0);
});

test("recent pending Assist post participates in persisted near-duplicate checks", () => {
  const result = JSON.parse(runIsolated(`${setup}
    const firstItem=makeIntent("assist-duplicate");
    const duplicateDraft=runAsOwner(firstItem.owner,()=>createDraft({externalId:"",accountId:firstItem.account.id,format:"post",text:firstItem.intent.text,now}));
    const duplicateIntent=runAsOwner(firstItem.owner,()=>createIntentForDraft(duplicateDraft.id,firstItem.account.id,now));
    runAsOwner(firstItem.owner,()=>approvePublicationIntent(duplicateIntent.id,now));
    let sends=0;const publisher=fakePublisher(async(_credential,input)=>{sends++;return {id:"800103",text:input.text};});
    const first=await dispatchPublicationIntent(firstItem.intent.id,{publisher,now:()=>now});
    const second=await dispatchPublicationIntent(duplicateIntent.id,{publisher,now:()=>now+1});
    console.log(JSON.stringify({first:first.status,second:second.status,reason:second.reason,sends}));
  `));
  expect(result.first).toBe("pending_reconciliation");
  expect(result.second).toBe("blocked");
  expect(result.reason).toContain("publication_near_duplicate");
  expect(result.sends).toBe(1);
});

test("source approvals expire at claim and require a new approval snapshot", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeIntent("expiry");
    runAsOwner(item.owner,()=>{
      const sourced=updateDraft({id:item.draft.id,sourceUrl:"https://x.com/source/status/81234567",sourceHandle:"source",now});
      const intent=createIntentForDraft(sourced.id,item.account.id,now);approvePublicationIntent(intent.id,now);
      const expiredAt=getPublicationIntent(intent.id).approvalExpiresAt;
      const lease=claimPublicationIntentLease({id:intent.id,now:expiredAt});
      const expired=getPublicationIntent(intent.id);
      const replacement=createIntentForDraft(sourced.id,item.account.id,expiredAt+1);
      const approved=approvePublicationIntent(replacement.id,expiredAt+1);
      console.log(JSON.stringify({expiredAt,lease,status:expired.status,events:getPublicationIntentEvents(intent.id).map(row=>row.event),replacementId:replacement.id,expires:approved.approvalExpiresAt,snapshotId:approved.approvalSnapshotId}));
    });
  `));
  expect(result.expiredAt).toBeGreaterThan(0);
  expect(result.lease).toBeNull();
  expect(result.status).toBe("expired");
  expect(result.events).toContain("expired");
  expect(result.replacementId).not.toBe(0);
  expect(result.expires).toBeGreaterThan(result.expiredAt);
  expect(result.snapshotId).toBeGreaterThan(0);
});

test("an approval expiring after claim is fenced before the once-only marker", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeIntent("expiry-marker");
    runAsOwner(item.owner,()=>{
      updateDraft({id:item.draft.id,sourceUrl:"https://x.com/source/status/81234568",sourceHandle:"source",now});
      const intent=createIntentForDraft(item.draft.id,item.account.id,now);approvePublicationIntent(intent.id,now);
      const expiry=getPublicationIntent(intent.id).approvalExpiresAt;
      const lease=claimPublicationIntentLease({id:intent.id,now:expiry-1});
      const marked=markPublicationIntentRequestSent({id:intent.id,leaseToken:lease.leaseToken,now:expiry});
      const current=getPublicationIntent(intent.id);
      console.log(JSON.stringify({marked,status:current.status,remoteWriteStartedAt:current.remoteWriteStartedAt,events:getPublicationIntentEvents(intent.id).map(row=>row.event)}));
    });
  `));
  expect(result.marked).toBe(false);
  expect(result.status).toBe("expired");
  expect(result.remoteWriteStartedAt).toBeNull();
  expect(result.events).toContain("expired");
  expect(result.events).not.toContain("request_sent");
});

test("approval snapshots bind immutable source and actor metadata", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeIntent("snapshot");
    runAsOwner(item.owner,()=>{
      updateDraft({id:item.draft.id,sourceUrl:"https://x.com/source/status/81234569",sourceHandle:"source",now});
      const intent=createIntentForDraft(item.draft.id,item.account.id,now);
      const approved=approvePublicationIntent(intent.id,now,{approvalSource:"automatic"});
      const db=new (process.getBuiltinModule("bun:sqlite") as {Database:new(path:string)=>any}).Database(process.env.ISPATLA_DB);
      const row=db.query("SELECT draft_revision,text,account_id,action,format,target_id,source_handle,source_url,media_hash,approval_source,expires_at FROM publication_approval_snapshots WHERE id=?").get(approved.approvalSnapshotId);
      db.close();console.log(JSON.stringify({approved,row}));
    });
  `));
  expect(result.row).toMatchObject({draft_revision:expect.any(Number),text:"An approved official post for snapshot",account_id:expect.any(Number),action:"post",format:"post",target_id:"81234569",source_handle:"source",source_url:"https://x.com/source/status/81234569",media_hash:"",approval_source:"automatic"});
  expect(result.row.expires_at).toBe(result.approved.approvalExpiresAt);
});

test("an automatic approval downgraded to Assist cannot write without human approval",()=>{
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeIntent("automatic-downgrade");
    const draft=runAsOwner(item.owner,()=>createDraft({externalId:"",accountId:item.account.id,format:"post",text:"Automatic content must not become human-approved.",now}));
    const intent=runAsOwner(item.owner,()=>createIntentForDraft(draft.id,item.account.id,now));
    runAsOwner(item.owner,()=>approvePublicationIntent(intent.id,now,{approvalSource:"automatic"}));
    let sends=0;const outcome=await dispatchPublicationIntent(intent.id,{publisher:fakePublisher(async()=>{sends++;return{id:"81234600",text:"sent"};}),now:()=>now});
    console.log(JSON.stringify({status:outcome.status,reason:outcome.reason,sends,requestSent:getPublicationIntentEvents(intent.id).some(row=>row.event==="request_sent")}));
  `));
  expect(result.status).toBe("blocked");
  expect(result.reason).toContain("human_approval_required");
  expect(result.sends).toBe(0);
  expect(result.requestSent).toBe(false);
});

test("a rejected intent stays audited and its draft cannot be hard-deleted",()=>{
  const result=JSON.parse(runIsolated(`${setup}
    const item=makeIntent("reject");const rejected=cancelPublicationIntent(item.intent.id,now);
    let reapprove="";try{approvePublicationIntent(item.intent.id,now+1);}catch(error){reapprove=error instanceof Error?error.message:String(error);}
    const deleted=deleteDraft(item.draft.id);
    console.log(JSON.stringify({status:rejected.status,reapprove,deleted,retained:getPublicationIntent(item.intent.id)?.status,events:getPublicationIntentEvents(item.intent.id).map(row=>row.event)}));
  `));
  expect(result.status).toBe("cancelled");
  expect(result.reapprove).toContain("cancelled durumunda");
  expect(result.deleted).toBe(false);
  expect(result.retained).toBe("cancelled");
  expect(result.events).toContain("cancelled");
});

test("editing an approved draft invalidates the old intent and requires new approval", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const {updateDraft}=await import("./src/server/db.ts");
    const item=makeIntent("edited");let sends=0;
    runAsOwner(item.owner,()=>updateDraft({id:item.draft.id,text:"A revised original text",now:now+1}));
    const old=runAsOwner(item.owner,()=>getPublicationIntent(item.intent.id));
    await runAsOwner(item.owner,()=>dispatchPublicationIntent(item.intent.id,{publisher:fakePublisher(async()=>{sends++;return {id:"99881",text:item.draft.text};})})).catch(()=>{});
    const replacement=runAsOwner(item.owner,()=>createIntentForDraft(item.draft.id,item.account.id,now+2));
    console.log(JSON.stringify({oldStatus:old.status,sends,newStatus:replacement.status,newText:replacement.text,different:replacement.id!==item.intent.id}));
  `));
  expect(result).toEqual({oldStatus:"cancelled",sends:0,newStatus:"pending_approval",newText:"A revised original text",different:true});
});

test("editing after a dispatch claim fences the worker before its write marker", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const {updateDraft}=await import("./src/server/db.ts");
    const item=makeIntent("race-edit");let sends=0;
    await runAsOwner(item.owner,()=>dispatchPublicationIntent(item.intent.id,{publisher:fakePublisher(async()=>{sends++;return {id:"99882",text:item.draft.text};}),beforeSend:()=>{updateDraft({id:item.draft.id,text:"Edited while dispatching",now:now+1});}})).catch(()=>{});
    console.log(JSON.stringify({sends,status:runAsOwner(item.owner,()=>getPublicationIntent(item.intent.id)).status}));
  `));
  expect(result).toEqual({sends:0,status:"cancelled"});
});

test("an unresolved remote write prevents editing its immutable approval snapshot", () => {
  const result=JSON.parse(runIsolated(`${setup}
    const {updateDraft,getDraft}=await import("./src/server/db.ts");
    const item=makeIntent("after-marker");let editRejected=false;
    const publisher=fakePublisher(async()=>{
      try{updateDraft({id:item.draft.id,text:"Changed after write marker",now:now+1});}catch{editRejected=true;}
      throw new OfficialXError({code:"unknown_remote_state",message:"lost",safeToRetry:false,remoteStateKnown:false});
    });
    await runAsOwner(item.owner,()=>dispatchPublicationIntent(item.intent.id,{publisher})).catch(()=>{});
    console.log(JSON.stringify({editRejected,text:runAsOwner(item.owner,()=>getDraft(item.draft.id)).text,status:runAsOwner(item.owner,()=>getPublicationIntent(item.intent.id)).status}));
  `));
  expect(result.editRejected).toBe(true);
  expect(result.text).toContain("An approved official post");
  expect(result.status).toBe("reconciliation_required");
});

test("a persisted account kill activated after claim stops the final write",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const {setPolicyKillControl}=await import("./src/server/policy-store.ts");
  const item=makeIntent("kill-race");let sends=0;
  const outcome=await runAsOwner(item.owner,()=>dispatchPublicationIntent(item.intent.id,{publisher:fakePublisher(async()=>{sends++;return {id:"99889",text:item.draft.text};}),beforeSend:()=>{setPolicyKillControl({scope:"account",value:item.account.id,enabled:true,expectedVersion:0,reason:"Stop before write",now});}}));
  console.log(JSON.stringify({sends,status:outcome.status,reason:outcome.reason}));
 `));
 expect(result.sends).toBe(0);expect(result.status).toBe("dead_letter");expect(result.reason).toContain("kill_switch");
});

test("a grant replaced after claim is rejected by the atomic send marker",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const item=makeIntent("grant-replacement-race");let sends=0;
  const outcome=await runAsOwner(item.owner,()=>dispatchPublicationIntent(item.intent.id,{publisher:fakePublisher(async()=>{sends++;return {id:"99890",text:item.draft.text};}),beforeSend:()=>{
   connectXAccount({ownerUserId:item.owner,xUserId:String(Number(item.account.id)+9000000),handle:item.account.handle,displayName:"Replacement",accessToken:"replacement-access",refreshToken:"replacement-refresh",expiresAt:now+7200,scopes,now});
  }}));
  console.log(JSON.stringify({sends,status:outcome.status,reason:outcome.reason}));
 `));
 expect(result.sends).toBe(0);expect(result.status).toBe("approved");
});

test("human Assist approval remains valid after an Auto grant is revoked back to Assist",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const item=makeIntent("auto-to-assist-human");
  setAutomationConsent({accountId:item.account.id,ownerUserId:item.owner,action:"post",mode:"auto",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:1,cadenceSeconds:60,expectedVersion:2,now});
  setAutomationConsent({accountId:item.account.id,ownerUserId:item.owner,action:"post",mode:"assist",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:3,now:now+1});
  let sends=0;const outcome=await dispatchPublicationIntent(item.intent.id,{publisher:fakePublisher(async()=>{sends++;return {id:"99891",text:item.draft.text};}),now:()=>now+2});
  console.log(JSON.stringify({sends,status:outcome.status,revokedAt:getXAccountAuthState(item.account.id,item.owner)?.consents.find(row=>row.action==="post")?.revokedAt}));
 `));
 expect(result.sends).toBe(1);expect(result.status).toBe("pending_reconciliation");expect(result.revokedAt).not.toBeNull();
});

test("the send marker rejects consent revoked after its authorization snapshot was captured",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const item=makeIntent("consent-revoked-at-cas");
  const consent=getXAccountAuthState(item.account.id,item.owner).consents.find(row=>row.action==="post");
  const {getXCredential}=await import("./src/server/x-oauth-store.ts");const credential=getXCredential(item.account.id,item.owner);
  const accountLease=runAsOwner(item.owner,()=>claimAccountDispatchLease({accountId:item.account.id,now}));
  const lease=runAsOwner(item.owner,()=>claimPublicationIntentLease({id:item.intent.id,now}));
  if(!accountLease||!lease||!credential)throw new Error("fixture lease/credential unavailable");
  const authorization={ownerUserId:item.owner,mode:"assist",consentVersion:consent.version,policyVersion:consent.policyVersion,copyVersion:consent.copyVersion,xUserId:credential.xUserId,credentialVersion:credential.version};
  setAutomationConsent({accountId:item.account.id,ownerUserId:item.owner,action:"post",mode:"off",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:consent.version,now:now+1});
  const marked=runAsOwner(item.owner,()=>markPublicationIntentRequestSent({id:item.intent.id,leaseToken:lease.leaseToken,accountLeaseToken:accountLease.leaseToken,now:now+2,authorization}));
  console.log(JSON.stringify({marked,events:getPublicationIntentEvents(item.intent.id).map(row=>row.event)}));
 `));
 expect(result.marked).toBe(false);expect(result.events).not.toContain("request_sent");
});

test("the Auto send marker rechecks newly recorded incident labels atomically",()=>{
 const result=JSON.parse(runIsolated(`${setup}
  const {createDraft,getCategories,saveAccountCategoryConfig}=await import("./src/server/db.ts");
  const {recordEvaluationPrediction,ensureEvaluationStore,adjudicateEvaluationPrediction}=await import("./src/server/evaluation-store.ts");
  const {getXCredential}=await import("./src/server/x-oauth-store.ts");
  const item=makeIntent("incident-at-marker");
  const category=runAsOwner(item.owner,()=>getCategories()[0]);
  runAsOwner(item.owner,()=>saveAccountCategoryConfig({accountId:item.account.id,categoryId:category.id,enabled:true,primary:true,weight:1,priority:1,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{}}));
  const candidate="incident-at-marker-source";
  const draft=runAsOwner(item.owner,()=>createDraft({externalId:candidate,accountId:item.account.id,format:"post",text:"Atomic incident fixture",now}));
  const intent=runAsOwner(item.owner,()=>createIntentForDraft(draft.id,item.account.id,now));
  runAsOwner(item.owner,()=>approvePublicationIntent(intent.id,now));
  grantAuto(item,1,60);
  const modelKey="incident-model",selectorVersion="incident-selector";
  ensureEvaluationStore();
  const prediction=runAsOwner(item.owner,()=>recordEvaluationPrediction({accountId:String(item.account.id),candidateId:candidate+":decision",leakageGroup:candidate,modelKey,rawScore:.5,selectorVersion,action:"post",category:category.slug,format:"post",riskTier:"low",features:{sourceCandidateId:candidate,decision:"eligible"},createdAt:now,resolveBy:now+3600}));
  const sqlDb=new (process.getBuiltinModule("bun:sqlite") as {Database:new(path:string)=>any}).Database(process.env.ISPATLA_DB);
  const hash="f".repeat(64),suggestionId="incident-marker-suggestion";
  sqlDb.query("INSERT INTO autonomy_suggestions(id,owner_user_id,account_id,action,category,risk_tier,clean_approvals,policy_failures,auth_failures,duplicate_incidents,unacceptable_outcomes,evidence_hash,status,created_at,decided_at,model_key,selector_version) VALUES (?,?,?,?,?,'low',30,0,0,0,0,?,'accepted',?,?,?,?)").run(suggestionId,item.owner,String(item.account.id),"post",category.slug,hash,now,now,modelKey,selectorVersion);
  sqlDb.query("INSERT INTO scoped_autonomy(owner_user_id,account_id,action,category,risk_tier,suggestion_id,enabled_at,disabled_at,model_key,selector_version) VALUES (?,?,?,?,'low',?,?,NULL,?,?)").run(item.owner,String(item.account.id),"post",category.slug,suggestionId,now,modelKey,selectorVersion);
  sqlDb.close();
  const accountLease=runAsOwner(item.owner,()=>claimAccountDispatchLease({accountId:item.account.id,now}));
  const lease=runAsOwner(item.owner,()=>claimPublicationIntentLease({id:intent.id,now}));
  const consent=getXAccountAuthState(item.account.id,item.owner).consents.find(row=>row.action==="post");
  const credential=getXCredential(item.account.id,item.owner);
  if(!accountLease||!lease||!consent||!credential)throw new Error("incident marker fixture setup failed");
  runAsOwner(item.owner,()=>adjudicateEvaluationPrediction({predictionId:prediction.id,label:"policy_block",reviewerRef:"test-reviewer",labeledAt:now+1}));
  const marked=runAsOwner(item.owner,()=>markPublicationIntentRequestSent({id:intent.id,leaseToken:lease.leaseToken,accountLeaseToken:accountLease.leaseToken,now:now+2,authorization:{ownerUserId:item.owner,mode:"auto",consentVersion:consent.version,policyVersion:consent.policyVersion,copyVersion:consent.copyVersion,xUserId:credential.xUserId,credentialVersion:credential.version,category:category.slug,autonomyEvidenceHash:hash,autonomyModelKey:modelKey,autonomySelectorVersion:selectorVersion}}));
  console.log(JSON.stringify({marked,events:getPublicationIntentEvents(intent.id).map(row=>row.event)}));
 `));
 expect(result.marked).toBe(false);expect(result.events).not.toContain("request_sent");
});
