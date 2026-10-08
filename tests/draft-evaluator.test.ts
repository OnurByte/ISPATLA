import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractDraftFeatures, scoreDraftFeatures } from "../src/server/draft-evaluator";
import type { DraftSemanticFeatures } from "../src/server/ai";

test("extracts deterministic draft features without treating source context as performance truth", () => {
  const features = extractDraftFeatures("2026 verisine göre oran %42. Ayrıntı: https://example.com ?", "photo");
  expect(features).toMatchObject({
    urlCount: 1,
    numberTokenCount: 2,
    question: true,
    mediaType: "photo",
  });
  expect(features.charCount).toBeGreaterThan(20);
});

test("semantic quality can lift a draft while bait risk drags it down", () => {
  const features = extractDraftFeatures("2026 verisine göre açık kaynak kullanımında %42 artış görüldü. En büyük değişim geliştirici araçlarında.", "none");
  const strong: DraftSemanticFeatures = {
    hookStrength: 85,
    specificity: 92,
    clarity: 90,
    novelty: 78,
    replyPotential: 62,
    repostPotential: 80,
    accountFit: 90,
    baitRisk: 5,
    helped: ["spesifik veri"],
    hurt: [],
    model: "test",
    provider: "api",
  };
  const bait: DraftSemanticFeatures = {
    ...strong,
    hookStrength: 55,
    clarity: 45,
    accountFit: 50,
    baitRisk: 95,
    helped: [],
    hurt: ["engagement bait riski"],
  };
  const strongScore = scoreDraftFeatures(features, strong);
  const baitScore = scoreDraftFeatures(features, bait);
  expect(strongScore.score).toBeGreaterThan(baitScore.score);
  expect(strongScore.helped).toContain("spesifik veri");
  expect(baitScore.hurt).toContain("engagement bait riski");
});

test("draft evaluation keeps untrained residual predictions null with mature official history",()=>{
  const directory=mkdtempSync(join(tmpdir(),"ispatla-draft-evaluation-"));
  try{
    const result=Bun.spawnSync({cmd:[process.execPath,"-e",`
      import {ensureDatabase,saveAccount,getCategories,createDraft} from "./src/server/db.ts";
      import {runAsOwner} from "./src/server/owner-context.ts";
      import {recordEvaluationPrediction,appendObservedOutcome} from "./src/server/evaluation-store.ts";
      import {evaluateDraft} from "./src/server/draft-evaluator.ts";
      ensureDatabase();const owner="draft-evaluator-owner";
      const account=runAsOwner(owner,()=>saveAccount({accountKey:"draft-evaluator",handle:"draft_eval",displayName:"Draft Eval",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:1}));
      const category=runAsOwner(owner,()=>getCategories()[0]);
      const draft=runAsOwner(owner,()=>createDraft({externalId:"draft-candidate",accountId:account.id,format:"post",text:"A concrete draft with enough specific words to evaluate against actual history.",now:1000000}));
      for(let index=0;index<6;index++)runAsOwner(owner,()=>{
        const publishedAt=100000+index,source="history-source-"+index;
        const prediction=recordEvaluationPrediction({accountId:String(account.id),candidateId:"history-decision-"+index,leakageGroup:source,modelKey:"decision-score-v1:"+category.slug,rawScore:50,selectorVersion:"decision-score-v1",action:"post",category:category.slug,format:"post",riskTier:"unknown",features:{sourceCandidateId:source,decision:"eligible"},createdAt:publishedAt-1,resolveBy:publishedAt+1});
        appendObservedOutcome({predictionId:prediction.id,capturedAt:publishedAt+14*86400,observedAt:publishedAt,metrics:{views:1000,likes:50,replies:10,reposts:5,quotes:2},source:"official_x_api",provenanceRef:"official_x:"+account.id+":"+(9000+index)+":published_at="+publishedAt});
      });
      const evaluated=await runAsOwner(owner,()=>evaluateDraft({draftId:draft.id,text:draft.text,account,categorySlug:category.slug,format:"post",now:1000000}));
      console.log(JSON.stringify({mode:evaluated.mode,samples:evaluated.baseline.samples,scope:evaluated.baseline.scope,residual:evaluated.predictedResidual,views:evaluated.predictedViews}));
    `],cwd:process.cwd(),env:{...process.env,ISPATLA_DB:join(directory,"state.sqlite3"),ISPATLA_SECRET_KEY:"draft-evaluator-test-key-123456789"},stdout:"pipe",stderr:"pipe"});
    const output=new TextDecoder().decode(result.stdout)+new TextDecoder().decode(result.stderr);
    expect(result.exitCode,output).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({mode:"shadow_cold_start",samples:6,scope:"account_category_format",residual:null,views:null});
  }finally{rmSync(directory,{recursive:true,force:true});}
});
