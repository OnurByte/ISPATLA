import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


if(process.env.ISPATLA_ISOLATED_EVENT_INTELLIGENCE === "1") {
const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

test("X observation provenance is immutable while metrics retain nullable revisions and claim contradictions", async () => {
  const directory=mkdtempSync(join(tmpdir(),"ispatla-event-intelligence-"));paths.push(directory);process.env.ISPATLA_DB=join(directory,"events.sqlite3");
  const store=await import("../src/server/event-store");
  expect(store.ensureEventStore()).toBe(true);
  const base={authorId:"author-1",authorHandle:"source",observedAt:100,postCreatedAt:90,textSnapshot:"Product announced",referencedPosts:[],urls:[],media:[],language:"en",readerProvider:"reader-x",rawHash:"hash-1"};
  const first=store.upsertXObservation({ ...base,xPostId:"post-1",metrics:{capturedAt:101,likes:null,replies:3,reposts:null,quotes:null,views:null} });
  const revision=store.upsertXObservation({ ...base,xPostId:"post-1",metrics:{capturedAt:200,likes:12,replies:null,reposts:1,quotes:null,views:120,censored:["replies"]} });
  const conflict=store.upsertXObservation({ ...base,xPostId:"post-1",authorId:"different-author",rawHash:"revised-provenance",metrics:{capturedAt:300,likes:14,replies:null,reposts:null,quotes:null,views:null} });
  expect(first.metrics.likes).toBeNull();expect(first.metricRevision).toBe(1);expect(revision.metricRevision).toBe(2);
  expect(conflict.immutableConflict).toBe(true);expect(store.getXObservation(first.id)?.authorId).toBe("author-1");expect(store.getXObservation(first.id)?.rawHash).toBe("hash-1");
  const second=store.upsertXObservation({...base,xPostId:"post-2",observedAt:110,rawHash:"hash-2",authorId:"author-2",textSnapshot:"Not public yet",metrics:{capturedAt:110,likes:null,replies:null,reposts:null,quotes:null,views:null}});
  const event=store.createEvent({title:"Product update",category:"technology",firstSeenAt:100});
  const other=store.createEvent({title:"Candidate duplicate",category:"technology",firstSeenAt:110});
  const claim=store.createClaim({eventId:event.id,type:"availability",normalizedText:"Product publicly available",entities:["Product"],firstSeenAt:100,confidenceClass:"unverified",verificationMode:"x-only"});
  const separateClaim=store.createClaim({eventId:event.id,type:"announcement",normalizedText:"Product announced",firstSeenAt:100,confidenceClass:"unverified",verificationMode:"x-only"});
  store.linkObservationClaim(claim.id,first.id,"supports",120);store.linkObservationClaim(claim.id,second.id,"contradicts",121);
  store.linkObservationClaim(separateClaim.id,second.id,"supports",122);
  expect(store.getClaimEvidence(claim.id).map(x=>x.relation)).toEqual(["supports","contradicts"]);
  store.attachObservationToEvent(other.id,second.id,130);
  expect(()=>store.recordEventSplit({sourceEventId:event.id,observationIds:[99999],title:"invalid",reason:"bad target",createdAt:150})).toThrow();
  expect(store.getEventIntelligenceSnapshot(event.id)?.observations).toHaveLength(2);
  store.recordEventMerge({sourceEventId:other.id,targetEventId:event.id,reason:"same development",details:{resolver:"fixture",similarity:.91},createdAt:140});
  const split=store.recordEventSplit({sourceEventId:event.id,observationIds:[second.id],title:"Availability contradicted",reason:"claim truth states differ",details:{reasonCode:"separate-assertion"},createdAt:160});
  expect(split.category).toBe("technology");expect(store.getEventIntelligenceSnapshot(event.id)?.observations.map(x=>x.id)).toEqual([first.id]);
  expect(store.getEventIntelligenceSnapshot(split.id)?.observations.map(x=>x.id)).toEqual([second.id]);
  expect(store.getEventIntelligenceSnapshot(split.id)?.claims.map(x=>x.id)).toContain(separateClaim.id);
  expect(store.getEventIntelligenceSnapshot(event.id)?.claims.map(x=>x.id)).toContain(claim.id);
  expect(store.listEventAudits().map(x=>x.action)).toEqual(["merge","split"]);
  const {calibrateSemanticThreshold}=await import("../src/server/event-intelligence");
  const profile=calibrateSemanticThreshold({scope:{model:"fixture-embed-v1",language:"en",category:"technology",comparisonKind:"event_candidate"},version:"fixture-1",fixtureHash:"fixture-hash",calibration:[.2,.3,.4,.7,.8,.9].map((similarity,index)=>({similarity,matches:index>=3})),validation:[{similarity:.25,matches:false},{similarity:.85,matches:true}]});
  expect(profile.status).toBe("calibrated");expect(profile.threshold).toBeGreaterThan(.4);expect(profile.threshold).toBeLessThan(.7);expect(profile.validationBalancedAccuracy).toBe(1);
  store.saveSemanticThresholdProfile(profile,170);expect(store.getLatestSemanticThresholdProfile(profile)?.fixtureHash).toBe("fixture-hash");
  const insufficient=calibrateSemanticThreshold({scope:profile,version:"few",fixtureHash:"too-small",calibration:[{similarity:.8,matches:true},{similarity:.7,matches:false}]});
  expect(insufficient.status).toBe("insufficient");expect(insufficient.threshold).toBeNull();
});

test("baselines preserve missingness and censored metrics and resist one extreme observation", async () => {
  const {robustMetricBaseline}=await import("../src/server/event-intelligence");
  const result=robustMetricBaseline([
    {metrics:{views:100}},{metrics:{views:110}},{metrics:{views:90}},{metrics:{views:1000}},
    {metrics:{views:null}},{metrics:{views:0},censored:["views"]},
  ],"views");
  expect(result.median).toBe(105);expect(result.mad).toBe(10);expect(result.available).toBe(4);
  expect(result.missing).toBe(1);expect(result.censored).toBe(1);expect(result.coverage).toBeCloseTo(4/6);
  expect(robustMetricBaseline([{metrics:{views:null}}],"views").median).toBeNull();
});

test("emergence, lifecycle, lineage and source-topic shrinkage discount self-amplifying evidence", async () => {
  const {classifyEventLifecycle,classifyEvidencePattern,scoreSourceTopicReputation}=await import("../src/server/event-intelligence");
  const independent=Array.from({length:5},(_,i)=>({xPostId:`p${i}`,authorId:`a${i}`,authorHandle:`a${i}`,observedAt:1000+i*30,textSnapshot:`Distinct report ${i}`,urls:[],referencedPosts:[]}));
  const broadcast=independent.map((item,i)=>({...item,referencedPosts:i===0?[]:[{kind:"repost_of" as const,xPostId:"root"}]}));
  expect(classifyEvidencePattern(broadcast).classification).toBe("broadcast");
  const coordinated=independent.map((item,i)=>({...item,xPostId:`c${i}`,textSnapshot:"Breaking: exact copied claim",observedAt:1000+i*10}));
  const coordination=classifyEvidencePattern(coordinated);expect(coordination.classification).toBe("coordinated_cluster");expect(coordination.independenceWeight).toBeLessThan(.5);
  const unavailable=classifyEventLifecycle({observations:independent,now:1100});expect(unavailable.emergence).toBeNull();expect(unavailable.confidence).toBe("insufficient");
  const emergent=classifyEventLifecycle({observations:independent,now:1100,historicalRateMedian:0,historicalRateMad:0,historicalSamples:25});
  expect(emergent.emergence).not.toBeNull();expect(emergent.windows.map(w=>w.seconds)).toEqual([120,300,600,1200,3600,21600,86400]);
  const tiny=scoreSourceTopicReputation([{sourceHandle:"small",topicId:"policy",eventFamilyId:"root-1",outcome:"useful",leadSeconds:30}],{alpha:2,beta:2})[0];
  expect(tiny.posterior).toBe(.6);expect(tiny.confidence).toBe("insufficient");
  const duplicated=scoreSourceTopicReputation([
    {sourceHandle:"small",topicId:"policy",eventFamilyId:"root-1",outcome:"useful",leadSeconds:30},
    {sourceHandle:"small",topicId:"policy",eventFamilyId:"root-1",outcome:"false_positive",leadSeconds:20},
    {sourceHandle:"small",topicId:"policy",eventFamilyId:"root-1",outcome:"false_positive",leadSeconds:20,coordinationLikelihood:.9},
  ],{alpha:2,beta:2})[0];
  expect(duplicated.rawSignals).toBe(3);expect(duplicated.independentFamilies).toBe(1);expect(duplicated.effectiveSampleSize).toBe(1);expect(duplicated.posterior).toBeCloseTo(.4952380952);
});

test("hand-labeled X lineage fixture reports exact shadow classification quality", async () => {
  const {classifyEvidencePattern}=await import("../src/server/event-intelligence");
  const make=(id:string,author:string,text:string,observedAt:number,root?:string)=>({xPostId:id,authorId:author,authorHandle:author,textSnapshot:text,observedAt,urls:[],referencedPosts:root?[{kind:"repost_of" as const,xPostId:root}]:[]});
  const fixtures=[
    {label:"broadcast",items:[make("b1","a1","first broadcast",1),make("b2","a2","second amplification",2,"root"),make("b3","a3","third amplification",3,"root"),make("b4","a4","fourth amplification",4,"root")]},
    {label:"organic_cascade",items:[make("c1","c1","independent report alpha",1),make("c2","c2","independent report beta",2),make("c3","c3","independent report gamma",3)]},
    {label:"coordinated_cluster",items:[make("x1","x1","exact copied announcement text",10),make("x2","x2","exact copied announcement text",20),make("x3","x3","exact copied announcement text",30)]},
    {label:"mixed",items:[make("m1","m1","shared family item one",1),make("m2","m2","shared family item two",2,"shared-root"),make("m3","m3","independent item",3,"shared-root")]},
    {label:"unknown",items:[make("u1","u1","single observation",1)]},
  ] as const;
  const confusion:Record<string,Record<string,number>>={};let correct=0;
  for(const fixture of fixtures){const predicted=classifyEvidencePattern(fixture.items).classification;confusion[fixture.label]??={};confusion[fixture.label][predicted]=(confusion[fixture.label][predicted]||0)+1;if(predicted===fixture.label)correct++;}
  expect(correct).toBe(fixtures.length);expect(correct/fixtures.length).toBe(1);expect(confusion).toEqual(Object.fromEntries(fixtures.map(item=>[item.label,{[item.label]:1}])));
});

} else {
  test("isolated event-intelligence.test.ts store regressions",()=>{
    const result=Bun.spawnSync({cmd:[process.execPath,"test","tests/event-intelligence.test.ts"],cwd:process.cwd(),env:{...process.env,ISPATLA_ISOLATED_EVENT_INTELLIGENCE:"1"},stdout:"pipe",stderr:"pipe"});
    const output=new TextDecoder().decode(result.stdout)+new TextDecoder().decode(result.stderr);
    expect(result.exitCode,output).toBe(0);expect(output).toContain("4 pass");expect(output).toContain("0 fail");
  });
}
