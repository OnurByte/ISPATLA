import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fixture() {
  const directory=mkdtempSync(join(tmpdir(),"ispatla-account-dispatch-"));
  const database=join(directory,"state.sqlite3");
  return {directory,database,env:{...process.env,ISPATLA_DB:database}};
}
function run(env:Record<string,string|undefined>,script:string):string{
  const result=Bun.spawnSync({cmd:[process.execPath,"-e",script],cwd:process.cwd(),env,stdout:"pipe",stderr:"pipe"});
  if(result.exitCode!==0)throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}

test("account dispatch lease is owner guarded, expiring, renewable, releasable, and fences old send/finish tokens",()=>{
  const {directory,env}=fixture();
  try{
    const output=run(env,`
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { ensureDatabase,saveAccount,createDraft,createJob,claimAutomationJobLease,markAutomationJobRequestSent,finishAutomationJobLease,claimAccountDispatchLease,renewAccountDispatchLease,releaseAccountDispatchLease,isAccountDispatchLeaseCurrent } from "./src/server/db.ts";
      ensureDatabase();
      const account=runAsOwner("owner-a",()=>saveAccount({accountKey:"lease-account",handle:"lease-account",displayName:"",enabled:true,defaultAccount:false,automationMode:"manual",dailyLimit:10,capabilities:[],now:1}));
      const foreign=runAsOwner("owner-b",()=>{let error="";try{claimAccountDispatchLease({accountId:account.id,now:2})}catch(e){error=String(e)}return {error,current:isAccountDispatchLeaseCurrent({accountId:account.id,leaseToken:"none",now:2})}});
      const d=runAsOwner("owner-a",()=>createDraft({externalId:"",accountId:account.id,format:"post",text:"lease test",now:2}));
      const job=runAsOwner("owner-a",()=>createJob({draftId:d.id,accountId:account.id,action:"post",scheduledAt:3,now:2}));
      const queueLease=runAsOwner("owner-a",()=>claimAutomationJobLease({id:job.id,now:3,leaseSeconds:100}));
      const first=runAsOwner("owner-a",()=>claimAccountDispatchLease({accountId:account.id,now:4,leaseSeconds:1}));
      const blocked=runAsOwner("owner-a",()=>claimAccountDispatchLease({accountId:account.id,now:5}));
      const markerWithoutAccountToken=runAsOwner("owner-a",()=>markAutomationJobRequestSent({id:job.id,leaseToken:queueLease.leaseToken,now:5}));
      const markerWithToken=runAsOwner("owner-a",()=>markAutomationJobRequestSent({id:job.id,leaseToken:queueLease.leaseToken,accountLeaseToken:first.leaseToken,now:5}));
      const markerAgain=runAsOwner("owner-a",()=>markAutomationJobRequestSent({id:job.id,leaseToken:queueLease.leaseToken,accountLeaseToken:first.leaseToken,now:6}));
      const wrongRenew=runAsOwner("owner-a",()=>renewAccountDispatchLease({accountId:account.id,leaseToken:"wrong",now:6}));
      const renewed=runAsOwner("owner-a",()=>renewAccountDispatchLease({accountId:account.id,leaseToken:first.leaseToken,now:6,leaseSeconds:5000}));
      const expiryAfterRenew=isAccountDispatchLeaseCurrent({accountId:account.id,leaseToken:first.leaseToken,now:3606});
      const released=runAsOwner("owner-a",()=>releaseAccountDispatchLease({accountId:account.id,leaseToken:first.leaseToken,now:3605}));
      const oldCurrent=isAccountDispatchLeaseCurrent({accountId:account.id,leaseToken:first.leaseToken,now:3606});
      const oldFinish=runAsOwner("owner-a",()=>finishAutomationJobLease({id:job.id,leaseToken:queueLease.leaseToken,accountLeaseToken:first.leaseToken,outcome:"accepted",now:3606}));
      const next=runAsOwner("owner-a",()=>claimAccountDispatchLease({accountId:account.id,now:3606}));
      const oldFinishDuringNew=runAsOwner("owner-a",()=>finishAutomationJobLease({id:job.id,leaseToken:queueLease.leaseToken,accountLeaseToken:first.leaseToken,outcome:"unknown_remote_state",now:3607}));
      console.log(JSON.stringify({foreign,queueLease:Boolean(queueLease),first,blocked,markerWithoutAccountToken,markerWithToken,markerAgain,wrongRenew,renewed,expiryAfterRenew,released,oldCurrent,oldFinish:Boolean(oldFinish),next:Boolean(next),oldFinishDuringNew:Boolean(oldFinishDuringNew)}));
    `);
    const result=JSON.parse(output);
    expect(result.foreign).toEqual({error:"Error: account not found",current:false});
    expect(result.queueLease).toBe(true);expect(result.first.leaseUntil).toBe(14);expect(result.blocked).toBeNull();
    expect(result.markerWithoutAccountToken).toBe(false);expect(result.markerWithToken).toBe(true);expect(result.markerAgain).toBe(false);
    expect(result.wrongRenew).toBe(false);expect(result.renewed).toBe(true);expect(result.expiryAfterRenew).toBe(false);
    expect(result.released).toBe(true);expect(result.oldCurrent).toBe(false);expect(result.oldFinish).toBe(false);
    expect(result.next).toBe(true);expect(result.oldFinishDuringNew).toBe(false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test("different jobs in one account cannot dispatch concurrently across processes",async()=>{
  const {directory,env}=fixture();
  try{
    const setup=JSON.parse(run(env,`
      import {runAsOwner} from "./src/server/owner-context.ts";
      import {ensureDatabase,saveAccount,createDraft,createJob} from "./src/server/db.ts";
      ensureDatabase();const data=runAsOwner("owner",()=>{const account=saveAccount({accountKey:"serial",handle:"serial",displayName:"",enabled:true,defaultAccount:false,automationMode:"manual",dailyLimit:10,capabilities:[],now:1});const a=createDraft({externalId:"",accountId:account.id,format:"post",text:"first",now:1});const b=createDraft({externalId:"",accountId:account.id,format:"reply",text:"second",now:1});return {accountId:account.id,first:createJob({draftId:a.id,accountId:account.id,action:"post",scheduledAt:10,now:1}).id,second:createJob({draftId:b.id,accountId:account.id,action:"reply",scheduledAt:10,now:1}).id}});console.log(JSON.stringify(data));
    `));
    const child=(jobId:number)=>`import {runAsOwner} from "./src/server/owner-context.ts";import {ensureDatabase,claimAccountDispatchLease,claimAutomationJobLease} from "./src/server/db.ts";ensureDatabase();const r=runAsOwner("owner",()=>{const account=claimAccountDispatchLease({accountId:${setup.accountId},now:10});if(!account)return "empty";const job=claimAutomationJobLease({id:${jobId},now:10});return job?"claimed":"account-only"});console.log(r);`;
    const children=[setup.first,setup.second].map(id=>Bun.spawn({cmd:[process.execPath,"-e",child(id)],cwd:process.cwd(),env,stdout:"pipe",stderr:"pipe"}));
    const outputs=await Promise.all(children.map(async process=>{const [stdout,stderr]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text()]);const exitCode=await process.exited;if(exitCode!==0)throw new Error(stderr);return stdout.trim();}));
    expect(outputs.filter(x=>x==="claimed")).toHaveLength(1);expect(outputs.filter(x=>x==="empty")).toHaveLength(1);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test("policy history includes only the user's account rows, excludes the active target, and preserves unknown budget usage",()=>{
  const {directory,env}=fixture();
  try{
    const output=run(env,`
      import {runAsOwner} from "./src/server/owner-context.ts";
      import {ensureDatabase,saveAccount,createDraft,createPublicationIntent,updatePublicationIntent,claimPublicationIntentLease,markPublicationIntentRequestSent,finishPublicationIntentLease,createJob,claimAutomationJobLease,markAutomationJobRequestSent,finishAutomationJobLease,readPublicationPolicyHistory} from "./src/server/db.ts";
      ensureDatabase();
      function makeAccount(key){return saveAccount({accountKey:key,handle:key,displayName:"",enabled:true,defaultAccount:false,automationMode:"manual",dailyLimit:10,capabilities:[],now:10})}
      const userA=runAsOwner("user-a",()=>{const a1=makeAccount("a1"),a2=makeAccount("a2");const d1=createDraft({externalId:"target-1",accountId:a1.id,format:"reply",text:"cross-account topic one",sourceHandle:"source-one",now:100});const i=createPublicationIntent({draftId:d1.id,accountId:a1.id,idempotencyKey:"intent-a",text:d1.text,now:100});updatePublicationIntent({id:i.id,status:"approved",now:101});const il=claimPublicationIntentLease({id:i.id,now:102});markPublicationIntentRequestSent({id:i.id,leaseToken:il.leaseToken,now:103});finishPublicationIntentLease({id:i.id,leaseToken:il.leaseToken,outcome:"unknown_remote_state",now:104});const d2=createDraft({externalId:"target-2",accountId:a2.id,format:"repost",text:"cross-account topic two",sourceHandle:"source-two",now:110});const j=createJob({draftId:d2.id,accountId:a2.id,action:"repost",scheduledAt:110,now:110});const jl=claimAutomationJobLease({id:j.id,now:111});markAutomationJobRequestSent({id:j.id,leaseToken:jl.leaseToken,now:112});finishAutomationJobLease({id:j.id,leaseToken:jl.leaseToken,outcome:"unknown_remote_state",now:113});return {intentId:i.id,jobId:j.id,history:readPublicationPolicyHistory({since:100})}});
      const userB=runAsOwner("user-b",()=>{const account=makeAccount("b");const draft=createDraft({externalId:"",accountId:account.id,format:"post",text:"other user private",now:120});const intent=createPublicationIntent({draftId:draft.id,accountId:account.id,idempotencyKey:"intent-b",text:draft.text,now:120});updatePublicationIntent({id:intent.id,status:"approved",now:121});const lease=claimPublicationIntentLease({id:intent.id,now:122});markPublicationIntentRequestSent({id:intent.id,leaseToken:lease.leaseToken,now:123});finishPublicationIntentLease({id:intent.id,leaseToken:lease.leaseToken,outcome:"unknown_remote_state",now:124});return readPublicationPolicyHistory({since:100})});
      console.log(JSON.stringify({userA,userB}));
    `);
    const result=JSON.parse(output);expect(result.userA.history).toHaveLength(2);expect(result.userB).toHaveLength(1);
    expect(result.userA.history.map((row:{accountId:number})=>row.accountId).sort()).toEqual([1,2]);
    expect(result.userA.history.some((row:{status:string;potentialBudgetUsed:boolean})=>row.status==="reconciliation_required"&&row.potentialBudgetUsed)).toBe(true);
    expect(result.userA.history.find((row:{action:string;targetId:string})=>row.action==="reply")?.targetId).toBe("target-1");
    expect(result.userA.history.find((row:{action:string;targetId:string})=>row.action==="repost")?.targetId).toBe("target-2");
    expect(JSON.stringify(result.userA.history)).not.toContain("private-provider-id");
    const excluded=run(env,`import {runAsOwner} from "./src/server/owner-context.ts";import {ensureDatabase,readPublicationPolicyHistory} from "./src/server/db.ts";ensureDatabase();console.log(JSON.stringify(runAsOwner("user-a",()=>readPublicationPolicyHistory({since:100,excludeIntentId:${result.userA.intentId},excludeJobId:${result.userA.jobId}}))));`);
    expect(JSON.parse(excluded)).toEqual([]);
    const old=run(env,`import {runAsOwner} from "./src/server/owner-context.ts";import {ensureDatabase,readPublicationPolicyHistory} from "./src/server/db.ts";ensureDatabase();console.log(JSON.stringify(runAsOwner("user-a",()=>readPublicationPolicyHistory({since:200}))));`);
    expect(JSON.parse(old)).toEqual([]);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
