import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if(process.env.ISPATLA_ISOLATED_AUTONOMY_MODEL_PIN==="1"){
  const sqlite=(process as unknown as {getBuiltinModule(id:string):unknown}).getBuiltinModule("bun:sqlite") as {Database:new(path:string)=>{exec(sql:string):void;close():void}};
  const legacyDb=new sqlite.Database(process.env.ISPATLA_DB!);
  legacyDb.exec("CREATE TABLE IF NOT EXISTS autonomy_suggestions(id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL,account_id TEXT NOT NULL,action TEXT NOT NULL,category TEXT NOT NULL,risk_tier TEXT NOT NULL,clean_approvals INTEGER NOT NULL,policy_failures INTEGER NOT NULL,auth_failures INTEGER NOT NULL,duplicate_incidents INTEGER NOT NULL,unacceptable_outcomes INTEGER NOT NULL,evidence_hash TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,decided_at INTEGER); CREATE TABLE IF NOT EXISTS scoped_autonomy(owner_user_id TEXT NOT NULL,account_id TEXT NOT NULL,action TEXT NOT NULL,category TEXT NOT NULL,risk_tier TEXT NOT NULL,suggestion_id TEXT NOT NULL,enabled_at INTEGER NOT NULL,disabled_at INTEGER,PRIMARY KEY(owner_user_id,account_id,action,category,risk_tier));");
  legacyDb.close();
  test("autonomy evidence and dispatch stay pinned to one persisted model and selector",async()=>{
    const db=await import("../src/server/db"),{runAsOwner}=await import("../src/server/owner-context"),store=await import("../src/server/evaluation-store"),autonomy=await import("../src/server/autonomy/evaluation"),execution=await import("../src/server/autonomy/execution"),publication=await import("../src/server/publication-service");
    const owner="autonomy-model-pin-owner";
    const account=runAsOwner(owner,()=>db.saveAccount({accountKey:"model-pin",handle:"model_pin",displayName:"Model Pin",enabled:true,defaultAccount:true,automationMode:"auto",dailyLimit:10,capabilities:["post"],now:10}));
    const category=runAsOwner(owner,()=>db.getCategories()[0]);
    runAsOwner(owner,()=>db.saveAccountCategoryConfig({accountId:account.id,categoryId:category.id,enabled:true,primary:true,weight:1,priority:1,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{}}));
    store.ensureEvaluationStore();
    const scope={accountId:String(account.id),action:"post",category:category.slug,riskTier:"low"};
    const addApproval=(index:number,modelKey:string,selectorVersion:string)=>runAsOwner(owner,()=>{
      const candidate=`model-pin-candidate-${index}`;
      store.recordEvaluationPrediction({accountId:String(account.id),candidateId:`${candidate}:decision`,leakageGroup:`model-pin-group-${index}`,modelKey,rawScore:.5,selectorVersion,action:"post",category:category.slug,format:"post",riskTier:"low",features:{sourceCandidateId:candidate,decision:"eligible"},createdAt:100+index,resolveBy:200+index});
      const draft=db.createDraft({externalId:candidate,accountId:account.id,format:"post",text:`Approved ${index}`,now:300+index});
      db.recordDraftEvaluation({draftId:draft.id,accountId:account.id,categorySlug:category.slug,mode:"shadow_cold_start",score:50,confidence:50,predictedResidual:null,baseline:{scope:"none",samples:0,medianViews:null,medianLikes:null,medianReplies:null,medianReposts:null,medianQuotes:null,medianEngagementRate:null},predictedViews:null,predictedReplies:null,predictedReposts:null,predictedQuotes:null,features:{},semantic:{},helped:[],hurt:[],now:300+index});
      const intent=db.createPublicationIntent({draftId:draft.id,accountId:account.id,idempotencyKey:`model-pin-${index}`,text:draft.text,now:400+index});
      publication.approvePublicationIntent(intent.id,500+index,{approvalSource:"human"});
      db.updatePublicationIntent({id:intent.id,status:"confirmed",approvedAt:500+index,confirmedAt:600+index,now:600+index});
      return draft.id;
    });
    for(let i=0;i<15;i++)addApproval(i,"model-a","selector-a");
    for(let i=15;i<30;i++)addApproval(i,"model-b","selector-b");
    expect(runAsOwner(owner,()=>store.getAutonomyEvidence(scope))).toMatchObject({cleanApprovals:15,modelKey:"model-b",selectorVersion:"selector-b"});
    expect(runAsOwner(owner,()=>autonomy.suggestScopedAutonomy({...scope,createdAt:700})).reason).toBe("insufficient_history");
    for(let i=30;i<45;i++)addApproval(i,"model-b","selector-b");
    const evidence=runAsOwner(owner,()=>store.getAutonomyEvidence(scope));
    expect(evidence.cleanApprovals).toBe(30);
    const proposal=runAsOwner(owner,()=>autonomy.suggestScopedAutonomy({...scope,createdAt:800}));
    expect(proposal.suggested).toBe(true);
    runAsOwner(owner,()=>autonomy.confirmScopedAutonomy(proposal.suggestionId!,801,evidence.evidenceHash,String(account.id)));
    const currentDraftId=addApproval(45,"model-b","selector-b");
    expect(()=>runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:currentDraftId,accountId:account.id,action:"post"}))).not.toThrow();
    const currentDraft=db.getDraft(currentDraftId)!;
    runAsOwner(owner,()=>store.recordEvaluationPrediction({accountId:String(account.id),candidateId:`${currentDraft.externalId}:changed`,leakageGroup:"model-pin-changed",modelKey:"model-c",rawScore:.5,selectorVersion:"selector-c",action:"post",category:category.slug,format:"post",riskTier:"low",features:{sourceCandidateId:currentDraft.externalId,decision:"eligible"},createdAt:900,resolveBy:1000}));
    expect(()=>runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:currentDraftId,accountId:account.id,action:"post"}))).toThrow("accepted model pin");
    expect(runAsOwner(owner,()=>autonomy.scopedAutonomyEnabled(scope))).toBe(false);
  });

  test("historical accepted scopes without a persisted pin fail closed",async()=>{
    const db=await import("../src/server/db"),{runAsOwner}=await import("../src/server/owner-context"),store=await import("../src/server/evaluation-store"),execution=await import("../src/server/autonomy/execution"),sqlite=(process as unknown as {getBuiltinModule(id:string):unknown}).getBuiltinModule("bun:sqlite") as {Database:new(path:string)=>{exec(sql:string):void;close():void}};
    const owner="autonomy-unbound-pin-owner",account=runAsOwner(owner,()=>db.saveAccount({accountKey:"legacy-pin",handle:"legacy_pin",displayName:"Legacy Pin",enabled:true,defaultAccount:true,automationMode:"auto",dailyLimit:10,capabilities:["post"],now:10})),scope={accountId:String(account.id),action:"post",category:"technology",riskTier:"low"};
    store.ensureEvaluationStore();
    // A migrated legacy row has no trustworthy selector/model identity to authorize.
    const database=new sqlite.Database(process.env.ISPATLA_DB!);
    try { database.exec(`INSERT INTO autonomy_suggestions(id,owner_user_id,account_id,action,category,risk_tier,clean_approvals,policy_failures,auth_failures,duplicate_incidents,unacceptable_outcomes,evidence_hash,status,created_at,decided_at) VALUES ('legacy-pin','${owner}','${account.id}','post','technology','low',30,0,0,0,0,'${"a".repeat(64)}','accepted',1,2); INSERT INTO scoped_autonomy(owner_user_id,account_id,action,category,risk_tier,suggestion_id,enabled_at,disabled_at) VALUES ('${owner}','${account.id}','post','technology','low','legacy-pin',2,NULL);`); } finally { database.close(); }
    expect(runAsOwner(owner,()=>store.confirmedAutonomyAuthorization(scope))).toBeNull();
    expect(runAsOwner(owner,()=>store.isScopedAutonomyEnabled(scope))).toBe(false);
    expect(()=>runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:1,accountId:1,action:"post"}))).toThrow();
  });
}else{
  test("isolated autonomy model-pin regressions",()=>{
    const directory=mkdtempSync(join(tmpdir(),"ispatla-autonomy-model-pin-"));
    const result=Bun.spawnSync({cmd:[process.execPath,"test","tests/autonomy-model-pin.test.ts"],cwd:process.cwd(),env:{...process.env,ISPATLA_DB:join(directory,"state.sqlite3"),ISPATLA_ISOLATED_AUTONOMY_MODEL_PIN:"1"},stdout:"pipe",stderr:"pipe"});
    const output=new TextDecoder().decode(result.stdout)+new TextDecoder().decode(result.stderr);
    rmSync(directory,{recursive:true,force:true});
    expect(result.exitCode,output).toBe(0);expect(output).toContain("2 pass");expect(output).toContain("0 fail");
  });
}
