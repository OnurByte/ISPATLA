import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


if(process.env.ISPATLA_ISOLATED_EVALUATION === "1") {
const directory=mkdtempSync(join(tmpdir(),"ispatla-evaluation-"));
process.env.ISPATLA_DB=join(directory,"state.sqlite3");
afterAll(()=>rmSync(directory,{recursive:true,force:true}));

test("evaluation keeps leakage groups together, validates account ownership and preserves censored chronology",async()=>{
  const db=await import("../src/server/db");const {runAsOwner}=await import("../src/server/owner-context");const store=await import("../src/server/evaluation-store");
  db.ensureDatabase();
  const accountA=runAsOwner("owner-a",()=>db.saveAccount({accountKey:"owner-a",handle:"owner_a",displayName:"Owner A",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:10}));
  const accountA2=runAsOwner("owner-a",()=>db.saveAccount({accountKey:"owner-a-2",handle:"owner_a_2",displayName:"Owner A2",enabled:true,defaultAccount:false,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:11}));
  const accountB=runAsOwner("owner-b",()=>db.saveAccount({accountKey:"owner-b",handle:"owner_b",displayName:"Owner B",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:10}));
  store.ensureEvaluationStore();
  const group="shared-event-family";const split=store.splitLeakageGroup(group);
  const prediction=runAsOwner("owner-a",()=>store.recordEvaluationPrediction({accountId:String(accountA.id),candidateId:"candidate-a",leakageGroup:group,modelKey:"selector-v1",rawScore:.7,selectorVersion:"selector-v1",action:"post",category:"technology",format:"post",riskTier:"low",features:{age:2},createdAt:100,resolveBy:200}));
  const scopedDue=runAsOwner("owner-a",()=>store.recordEvaluationPrediction({accountId:String(accountA2.id),candidateId:"candidate-a2",leakageGroup:"scoped-due",modelKey:"scoped-model",rawScore:.7,selectorVersion:"selector-v1",action:"post",category:"technology",format:"post",riskTier:"low",features:{age:2},createdAt:100,resolveBy:201}));
  expect(runAsOwner("owner-a",()=>store.listDueUnresolvedPredictions(300,1,{accountId:String(accountA2.id),modelKey:"scoped-model"}).map(row=>row.id))).toEqual([scopedDue.id]);
  expect(prediction.split).toBe(split);
  expect(runAsOwner("owner-a",()=>store.splitLeakageGroup(group))).toBe(split);
  expect(()=>runAsOwner("owner-a",()=>store.recordEvaluationPrediction({accountId:String(accountB.id),candidateId:"foreign",leakageGroup:"foreign-group",modelKey:"selector-v1",rawScore:.5,selectorVersion:"selector-v1",action:"post",category:"technology",format:"post",riskTier:"low",features:{},createdAt:100,resolveBy:200}))).toThrow("evaluation account not found for owner");
  runAsOwner("owner-a",()=>store.appendObservedOutcome({predictionId:prediction.id,capturedAt:220,observedAt:210,metrics:{views:null,likes:0,replies:null,reposts:null,quotes:null},censored:["views"],source:"official_x_api",provenanceRef:"fixture"}));
  expect(runAsOwner("owner-a",()=>store.listEvaluationOutcomes(prediction.id))).toMatchObject([{observedAt:210,metrics:{views:null,likes:0},censored:["views"]}]);
  runAsOwner("owner-a",()=>store.appendObservedOutcome({predictionId:prediction.id,capturedAt:230,observedAt:220,metrics:{views:12,likes:null,replies:null,reposts:null,quotes:null},source:"official_x_api",provenanceRef:"fixture-2"}));
  expect(()=>runAsOwner("owner-a",()=>store.appendObservedOutcome({predictionId:prediction.id,capturedAt:240,observedAt:215,metrics:{views:1,likes:null,replies:null,reposts:null,quotes:null},source:"human_review",provenanceRef:"fixture-3"}))).toThrow("observed and captured time order");
  expect(()=>runAsOwner("owner-b",()=>store.appendObservedOutcome({predictionId:prediction.id,capturedAt:230,observedAt:220,metrics:{views:1,likes:null,replies:null,reposts:null,quotes:null},source:"human_review",provenanceRef:"foreign"}))).toThrow("prediction not found for owner");
});

test("scoped autonomy derives evidence from confirmed owner publications and revalidates before confirmation",async()=>{
  const db=await import("../src/server/db");const {runAsOwner}=await import("../src/server/owner-context");const autonomy=await import("../src/server/autonomy/evaluation");const store=await import("../src/server/evaluation-store");const publication=await import("../src/server/publication-service");
  const account=runAsOwner("autonomy-owner",()=>db.saveAccount({accountKey:"autonomy",handle:"autonomy",displayName:"Autonomy",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:20}));
  const scope={accountId:String(account.id),action:"post",category:"technology",riskTier:"low"};
  expect(runAsOwner("autonomy-owner",()=>autonomy.suggestScopedAutonomy({...scope,cleanApprovals:40,policyFailures:0,authFailures:0,duplicateIncidents:0,unacceptableOutcomes:0,createdAt:30} as never)).reason).toBe("insufficient_history");
  const predictionIds:string[]=[];
  for(let i=0;i<30;i++)runAsOwner("autonomy-owner",()=>{
    const candidate=`autonomy-candidate-${i}`;
    const p=store.recordEvaluationPrediction({accountId:String(account.id),candidateId:candidate,leakageGroup:`autonomy-group-${i}`,modelKey:"autonomy-test",rawScore:.5,selectorVersion:"test",action:"post",category:"technology",format:"post",riskTier:"low",features:{sourceCandidateId:candidate,decision:"eligible"},createdAt:100+i,resolveBy:200+i});
    predictionIds.push(p.id);
    const draft=db.createDraft({externalId:candidate,accountId:account.id,format:"post",text:"approved fixture",now:300+i});
    const intent=db.createPublicationIntent({draftId:draft.id,accountId:account.id,idempotencyKey:`autonomy-intent-${i}`,text:"approved fixture",now:400+i});
    publication.approvePublicationIntent(intent.id,500+i);
    db.updatePublicationIntent({id:intent.id,status:"confirmed",confirmedAt:600+i,now:600+i});
  });
  const proposal=runAsOwner("autonomy-owner",()=>autonomy.suggestScopedAutonomy({...scope,createdAt:700}));
  expect(proposal.suggested).toBe(true);expect(runAsOwner("autonomy-owner",()=>autonomy.scopedAutonomyEnabled(scope))).toBe(false);
  expect(()=>runAsOwner("other-owner",()=>autonomy.confirmScopedAutonomy(proposal.suggestionId!,40))).toThrow("pending autonomy suggestion not found for owner");
  runAsOwner("autonomy-owner",()=>store.adjudicateEvaluationPrediction({predictionId:predictionIds[0],label:"policy_block",reviewerRef:"reviewer",labeledAt:701}));
  expect(()=>runAsOwner("autonomy-owner",()=>autonomy.confirmScopedAutonomy(proposal.suggestionId!,702))).toThrow("autonomy evidence changed");
  const refreshed=runAsOwner("autonomy-owner",()=>autonomy.suggestScopedAutonomy({...scope,createdAt:703}));
  expect(refreshed.reason).toBe("incident");
});

test("confirmed scoped autonomy can be demoted and remains audited",async()=>{
  const db=await import("../src/server/db");const {runAsOwner}=await import("../src/server/owner-context");const autonomy=await import("../src/server/autonomy/evaluation");const store=await import("../src/server/evaluation-store");const publication=await import("../src/server/publication-service");
  const account=runAsOwner("demote-owner",()=>db.saveAccount({accountKey:"demote",handle:"demote",displayName:"Demote",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:20}));
  const scope={accountId:String(account.id),action:"post",category:"technology",riskTier:"low"};
  for(let i=0;i<30;i++)runAsOwner("demote-owner",()=>{
    const candidate=`demote-candidate-${i}`;
    store.recordEvaluationPrediction({accountId:String(account.id),candidateId:candidate,leakageGroup:`demote-group-${i}`,modelKey:"demote-test",rawScore:.5,selectorVersion:"test",action:"post",category:"technology",format:"post",riskTier:"low",features:{sourceCandidateId:candidate,decision:"eligible"},createdAt:100+i,resolveBy:200+i});
    const draft=db.createDraft({externalId:candidate,accountId:account.id,format:"post",text:"approved fixture",now:300+i});
    const intent=db.createPublicationIntent({draftId:draft.id,accountId:account.id,idempotencyKey:`demote-intent-${i}`,text:"approved fixture",now:400+i});
    publication.approvePublicationIntent(intent.id,500+i);
    db.updatePublicationIntent({id:intent.id,status:"confirmed",confirmedAt:600+i,now:600+i});
  });
  const proposal=runAsOwner("demote-owner",()=>autonomy.suggestScopedAutonomy({...scope,createdAt:700}));
  runAsOwner("demote-owner",()=>autonomy.confirmScopedAutonomy(proposal.suggestionId!,701));
  expect(runAsOwner("demote-owner",()=>autonomy.scopedAutonomyEnabled(scope))).toBe(true);
  expect(runAsOwner("demote-owner",()=>autonomy.demoteAutonomyAfterIncident({...scope,reason:"duplicate_risk",now:702}))).toBe(true);
  expect(runAsOwner("demote-owner",()=>autonomy.scopedAutonomyEnabled(scope))).toBe(false);
  expect(runAsOwner("demote-owner",()=>store.listAutonomyAudit())).toMatchObject([{event:"suggested"},{event:"confirmed"},{event:"demoted",reason:"duplicate_risk"}]);
});

test("calibration uses a disjoint calibration split and holdout rows only score the frozen profile",async()=>{
  const db=await import("../src/server/db");const {runAsOwner}=await import("../src/server/owner-context");const store=await import("../src/server/evaluation-store");const calibration=await import("../src/server/calibration");
  const account=runAsOwner("cal-owner",()=>db.saveAccount({accountKey:"cal",handle:"cal",displayName:"Calibration",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:60}));
  const groupsFor=(split:"calibration"|"holdout",count:number)=>{const selected:string[]=[];for(let i=0;selected.length<count&&i<10000;i++){const group=`${split}-group-${i}`;if(store.splitLeakageGroup(group)===split)selected.push(group);}if(selected.length<count)throw new Error("could not create fixture split");return selected;};
  const add=(group:string,index:number,split:"calibration"|"holdout")=>runAsOwner("cal-owner",()=>{
    const p=store.recordEvaluationPrediction({accountId:String(account.id),candidateId:`${split}-${index}`,leakageGroup:group,modelKey:"m",rawScore:index%2,selectorVersion:"s",action:"post",category:"tech",format:"post",riskTier:"low",features:{},createdAt:100+index,resolveBy:200+index});
    expect(p.split).toBe(split);store.adjudicateEvaluationPrediction({predictionId:p.id,label:index%2===1?"hit":"miss",reviewerRef:"reviewer",labeledAt:300+index});
  });
  groupsFor("calibration",4).forEach((group,i)=>add(group,i,"calibration"));
  groupsFor("holdout",4).forEach((group,i)=>add(group,i,"holdout"));
  const fit=runAsOwner("cal-owner",()=>calibration.calibrateStoredModel({accountId:String(account.id),modelKey:"m",minimumSamples:2,now:400}));
  expect(fit.status).toBe("calibrated");
  const result=runAsOwner("cal-owner",()=>calibration.evaluateStoredHoldout({accountId:String(account.id),modelKey:"m",now:500}));
  expect(result.status).toBe("calibrated");expect(result.sampleCount).toBe(4);expect(result.brier).not.toBeNull();expect(result.replayId).toBeTruthy();
  expect(runAsOwner("cal-owner",()=>store.latestCalibrationProfile(JSON.stringify([String(account.id),"m"]))?.mapping)).toEqual(fit.mapping);
  expect(()=>runAsOwner("other-owner",()=>calibration.evaluateStoredHoldout({accountId:String(account.id),modelKey:"m",now:500}))).toThrow("evaluation account not found for owner");
  expect(()=>runAsOwner("other-owner",()=>store.saveEvaluationReplay({accountId:String(account.id),modelKey:"m",datasetHash:"foreign",sampleCount:0,brier:null,logLoss:null,ece:null,reliability:[],createdAt:501}))).toThrow("evaluation account not found for owner");
});

} else {
  test("isolated evaluation.test.ts store regressions",()=>{
    const result=Bun.spawnSync({cmd:[process.execPath,"test","tests/evaluation.test.ts"],cwd:process.cwd(),env:{...process.env,ISPATLA_ISOLATED_EVALUATION:"1"},stdout:"pipe",stderr:"pipe"});
    const output=new TextDecoder().decode(result.stdout)+new TextDecoder().decode(result.stderr);
    expect(result.exitCode,output).toBe(0);expect(output).toContain("4 pass");expect(output).toContain("0 fail");
  });
}
