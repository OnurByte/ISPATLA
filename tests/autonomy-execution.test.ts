import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if(process.env.ISPATLA_ISOLATED_AUTONOMY_EXECUTION==="1"){
  test("earned automatic sends need exact persisted low-risk classification and fresh human-approved history",async()=>{
    const db=await import("../src/server/db"),{runAsOwner}=await import("../src/server/owner-context"),store=await import("../src/server/evaluation-store"),autonomy=await import("../src/server/autonomy/evaluation"),execution=await import("../src/server/autonomy/execution"),publication=await import("../src/server/publication-service");
    const owner="earned-execution-owner";
    const account=runAsOwner(owner,()=>db.saveAccount({accountKey:"earned",handle:"earned_exec",displayName:"Earned",enabled:true,defaultAccount:true,automationMode:"auto",dailyLimit:10,capabilities:["post"],now:10}));
    const category=runAsOwner(owner,()=>db.getCategories()[0]);
    runAsOwner(owner,()=>db.saveAccountCategoryConfig({accountId:account.id,categoryId:category.id,enabled:true,primary:true,weight:1,priority:1,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{}}));
    store.ensureEvaluationStore();
    const scope={accountId:String(account.id),action:"post",category:category.slug,riskTier:"low"};
    const makeHistory=(index:number)=>runAsOwner(owner,()=>{
      const candidate=`earned-candidate-${index}`;
      const prediction=store.recordEvaluationPrediction({accountId:String(account.id),candidateId:`${candidate}:decision:${index}`,leakageGroup:`earned-group-${index}`,modelKey:"earned-v1",rawScore:.5,selectorVersion:"test",action:"post",category:category.slug,format:"post",riskTier:"low",features:{sourceCandidateId:candidate,decision:"eligible"},createdAt:100+index,resolveBy:200+index});
      const draft=db.createDraft({externalId:candidate,accountId:account.id,format:"post",text:`Approved fixture ${index}`,now:300+index});
      db.recordDraftEvaluation({draftId:draft.id,accountId:account.id,categorySlug:category.slug,mode:"shadow_cold_start",score:50,confidence:50,predictedResidual:null,baseline:{scope:"none",samples:0,medianViews:null,medianLikes:null,medianReplies:null,medianReposts:null,medianQuotes:null,medianEngagementRate:null},predictedViews:null,predictedReplies:null,predictedReposts:null,predictedQuotes:null,features:{},semantic:{},helped:[],hurt:[],now:300+index});
      const intent=db.createPublicationIntent({draftId:draft.id,accountId:account.id,idempotencyKey:`earned-${index}`,text:draft.text,now:400+index});
      publication.approvePublicationIntent(intent.id,500+index,{approvalSource:"human"});
      db.updatePublicationIntent({id:intent.id,status:"confirmed",approvedAt:500+index,confirmedAt:600+index,now:600+index});
      return {draftId:draft.id,candidate,predictionId:prediction.id};
    });
    const empty=runAsOwner(owner,()=>autonomy.suggestScopedAutonomy({...scope,createdAt:700}));
    expect(empty.reason).toBe("insufficient_history");
    for(let index=0;index<30;index++)makeHistory(index);
    expect(runAsOwner(owner,()=>store.getAutonomyEvidence(scope).cleanApprovals)).toBe(30);
    const proposal=runAsOwner(owner,()=>autonomy.suggestScopedAutonomy({...scope,createdAt:800}));
    expect(proposal.suggested).toBe(true);
    const evidence=runAsOwner(owner,()=>store.getAutonomyEvidence(scope));
    expect(()=>runAsOwner(owner,()=>autonomy.confirmScopedAutonomy(proposal.suggestionId!,801,evidence.evidenceHash,String(account.id+1)))).toThrow("not found for owner account");
    runAsOwner(owner,()=>autonomy.confirmScopedAutonomy(proposal.suggestionId!,801,evidence.evidenceHash,String(account.id)));
    const latest=makeHistory(31);
    expect(()=>runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:latest.draftId,accountId:account.id,action:"post"}))).not.toThrow();
    const changedProposal=runAsOwner(owner,()=>autonomy.suggestScopedAutonomy({...scope,createdAt:802}));
    const changedEvidence=runAsOwner(owner,()=>store.getAutonomyEvidence(scope));
    runAsOwner(owner,()=>store.adjudicateEvaluationPrediction({predictionId:latest.predictionId,label:"policy_block",reviewerRef:"reviewer",labeledAt:803}));
    expect(()=>runAsOwner(owner,()=>autonomy.confirmScopedAutonomy(changedProposal.suggestionId!,804,changedEvidence.evidenceHash,String(account.id)))).toThrow("autonomy evidence changed");
    runAsOwner(owner,()=>execution.demoteAutomaticExecution({draftId:latest.draftId,accountId:account.id,action:"post",reason:"duplicate_risk",now:805}));
    expect(()=>runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:latest.draftId,accountId:account.id,action:"post"}))).toThrow();
    let sent=false;try{runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:latest.draftId,accountId:account.id,action:"post"}));sent=true;}catch{}
    expect(sent).toBe(false);
    const incident=makeHistory(32);
    runAsOwner(owner,()=>db.updatePublicationIntent({id:db.getPublicationIntents().find(row=>row.draftId===incident.draftId)!.id,status:"blocked",reason:"policy_blocked:fixture",now:806}));
    expect(runAsOwner(owner,()=>store.getAutonomyEvidence(scope).policyFailures)).toBeGreaterThan(0);
  });

  test("classification mismatch, changed proposal evidence, and unconfirmed manual assist fail closed only where required",async()=>{
    const db=await import("../src/server/db"),{runAsOwner}=await import("../src/server/owner-context"),store=await import("../src/server/evaluation-store"),autonomy=await import("../src/server/autonomy/evaluation"),execution=await import("../src/server/autonomy/execution"),{decideXPolicy}=await import("../src/server/x-policy");
    const owner="earned-mismatch-owner";
    const account=runAsOwner(owner,()=>db.saveAccount({accountKey:"mismatch",handle:"earned_mismatch",displayName:"Mismatch",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:10}));
    const category=runAsOwner(owner,()=>db.getCategories()[0]);
    runAsOwner(owner,()=>db.saveAccountCategoryConfig({accountId:account.id,categoryId:category.id,enabled:true,primary:true,weight:1,priority:1,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{}}));
    store.ensureEvaluationStore();
    const scope={accountId:String(account.id),action:"post",category:category.slug,riskTier:"low"};
    const candidate="mismatch-candidate";
    const draft=runAsOwner(owner,()=>db.createDraft({externalId:candidate,accountId:account.id,format:"post",text:"manual assist is still allowed",now:20}));
    runAsOwner(owner,()=>db.recordDraftEvaluation({draftId:draft.id,accountId:account.id,categorySlug:category.slug,mode:"shadow_cold_start",score:50,confidence:50,predictedResidual:null,baseline:{scope:"none",samples:0,medianViews:null,medianLikes:null,medianReplies:null,medianReposts:null,medianQuotes:null,medianEngagementRate:null},predictedViews:null,predictedReplies:null,predictedReposts:null,predictedQuotes:null,features:{},semantic:{},helped:[],hurt:[],now:20}));
    runAsOwner(owner,()=>store.recordEvaluationPrediction({accountId:String(account.id),candidateId:`${candidate}:decision:1`,leakageGroup:"mismatch-group",modelKey:"mismatch-v1",rawScore:.5,selectorVersion:"test",action:"post",category:"wrong-category",format:"post",riskTier:"low",features:{sourceCandidateId:candidate,decision:"eligible"},createdAt:20,resolveBy:30}));
    expect(()=>runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:draft.id,accountId:account.id,action:"post"}))).toThrow("unknown, conflicting, or high-risk");
    expect(decideXPolicy({action:"post",automatic:false,mode:"assist",accountId:account.id,now:30,text:"human approved",grantConnected:true,capabilities:["post"],humanApproved:true,history:[]}).allowed).toBe(true);
    for(const decision of ["rejected","skipped"]){
      const source=`ineligible-${decision}`;
      const denied=runAsOwner(owner,()=>db.createDraft({externalId:source,accountId:account.id,format:"post",text:"must stay unsent",now:30}));
      runAsOwner(owner,()=>db.recordDraftEvaluation({draftId:denied.id,accountId:account.id,categorySlug:category.slug,mode:"shadow_cold_start",score:50,confidence:50,predictedResidual:null,baseline:{scope:"none",samples:0,medianViews:null,medianLikes:null,medianReplies:null,medianReposts:null,medianQuotes:null,medianEngagementRate:null},predictedViews:null,predictedReplies:null,predictedReposts:null,predictedQuotes:null,features:{},semantic:{},helped:[],hurt:[],now:30}));
      runAsOwner(owner,()=>store.recordEvaluationPrediction({accountId:String(account.id),candidateId:`${source}:decision:1`,leakageGroup:source,modelKey:"mismatch-v1",rawScore:.5,selectorVersion:"test",action:"post",category:category.slug,format:"post",riskTier:"low",features:{sourceCandidateId:source,decision},createdAt:30,resolveBy:40}));
      expect(()=>runAsOwner(owner,()=>execution.authorizeAutomaticSend({draftId:denied.id,accountId:account.id,action:"post"}))).toThrow("unknown, conflicting, or high-risk");
    }
    // A proposal hash is bound to current persisted evidence at confirmation time.
    const forged=runAsOwner(owner,()=>autonomy.suggestScopedAutonomy({...scope,createdAt:31}));
    expect(forged.suggested).toBe(false);
  });

  test("predictions created after human approval cannot backfill the thirty-approval threshold",async()=>{
    const db=await import("../src/server/db"),{runAsOwner}=await import("../src/server/owner-context"),store=await import("../src/server/evaluation-store"),autonomy=await import("../src/server/autonomy/evaluation"),publication=await import("../src/server/publication-service");
    const owner="earned-backfill-owner";
    const account=runAsOwner(owner,()=>db.saveAccount({accountKey:"earned-backfill",handle:"earned_backfill",displayName:"Backfill",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:10}));
    const scope={accountId:String(account.id),action:"post",category:"technology",riskTier:"low"};
    for(let index=0;index<30;index++)runAsOwner(owner,()=>{
      const source=`late-source-${index}`,draft=db.createDraft({externalId:source,accountId:account.id,format:"post",text:`Approved before evaluation ${index}`,now:20+index});
      const intent=db.createPublicationIntent({draftId:draft.id,accountId:account.id,idempotencyKey:`late-approval-${index}`,text:draft.text,now:50+index});
      publication.approvePublicationIntent(intent.id,100+index,{approvalSource:"human"});
      db.updatePublicationIntent({id:intent.id,status:"confirmed",confirmedAt:110+index,now:110+index});
      store.recordEvaluationPrediction({accountId:String(account.id),candidateId:`${source}:decision:late`,leakageGroup:source,modelKey:"late-model",rawScore:.5,selectorVersion:"test",action:"post",category:"technology",format:"post",riskTier:"low",features:{sourceCandidateId:source,decision:"eligible"},createdAt:200+index,resolveBy:300+index});
    });
    expect(runAsOwner(owner,()=>store.getAutonomyEvidence(scope).cleanApprovals)).toBe(0);
    expect(runAsOwner(owner,()=>autonomy.suggestScopedAutonomy({...scope,createdAt:400})).reason).toBe("insufficient_history");
  });
}else{
  test("isolated earned-autonomy execution boundary",()=>{
    const directory=mkdtempSync(join(tmpdir(),"ispatla-earned-execution-"));
    const result=Bun.spawnSync({cmd:[process.execPath,"test","tests/autonomy-execution.test.ts"],cwd:process.cwd(),env:{...process.env,ISPATLA_DB:join(directory,"state.sqlite3"),ISPATLA_ISOLATED_AUTONOMY_EXECUTION:"1"},stdout:"pipe",stderr:"pipe"});
    const output=new TextDecoder().decode(result.stdout)+new TextDecoder().decode(result.stderr);
    rmSync(directory,{recursive:true,force:true});
    expect(result.exitCode,output).toBe(0);expect(output).toContain("3 pass");expect(output).toContain("0 fail");
  });
}
