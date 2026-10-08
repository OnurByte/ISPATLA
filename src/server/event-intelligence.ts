import type { XObservation } from "./event-store";
import type { SemanticThresholdProfile } from "./event-store";

export const EVENT_INTELLIGENCE_VERSION = "event-shadow-v1";
export const METRIC_NAMES = ["likes", "replies", "reposts", "quotes", "views"] as const;
export type MetricName = (typeof METRIC_NAMES)[number];
export type Confidence = "insufficient" | "low" | "moderate" | "high";
export type MetricBaseline = {
  metric: MetricName; median: number | null; mad: number | null; p90: number | null;
  available: number; missing: number; censored: number; coverage: number; confidence: Confidence;
};
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b); const middle=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};
function quantile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b); return sorted[Math.max(0,Math.ceil(probability*sorted.length)-1)];
}
function confidence(samples: number, coverage: number): Confidence {
  if(samples<5 || coverage<0.25)return "insufficient";
  if(samples<20 || coverage<0.5)return "low";
  if(samples<50 || coverage<0.8)return "moderate";
  return "high";
}
/** Missing or explicitly censored metrics are excluded, never coerced to zero. */
export function robustMetricBaseline(samples: Array<{ metrics: Partial<Record<MetricName, number | null>>; censored?: MetricName[] }>, metric: MetricName): MetricBaseline {
  const values:number[]=[]; let missing=0,censored=0;
  for(const sample of samples){
    if(sample.censored?.includes(metric)){censored++;continue;}
    const value=sample.metrics[metric];
    if(value===null || value===undefined || !Number.isFinite(value) || value<0){missing++;continue;}
    values.push(value);
  }
  const center=median(values); const mad=center===null?null:median(values.map(value=>Math.abs(value-center)));
  const coverage=samples.length?values.length/samples.length:0;
  return {metric,median:center,mad,p90:quantile(values,.9),available:values.length,missing,censored,coverage,confidence:confidence(values.length,coverage)};
}
export function robustMetricBaselines(samples: Array<{ metrics: Partial<Record<MetricName, number | null>>; censored?: MetricName[] }>): Record<MetricName,MetricBaseline> {
  return Object.fromEntries(METRIC_NAMES.map(metric=>[metric,robustMetricBaseline(samples,metric)])) as Record<MetricName,MetricBaseline>;
}

export type LabeledSimilarity={similarity:number;matches:boolean};
/** Calibrate separately by model/language/category/comparison kind; never invent a fallback cutoff. */
export function calibrateSemanticThreshold(input:{scope:{model:string;language:string;category:string;comparisonKind:string};version:string;calibration:LabeledSimilarity[];validation?:LabeledSimilarity[];fixtureHash:string;minimumPerClass?:number}):SemanticThresholdProfile & {validationBalancedAccuracy:number|null}{
  const positives=input.calibration.filter(item=>item.matches).length,negatives=input.calibration.length-positives;
  if(input.calibration.some(item=>!Number.isFinite(item.similarity)||item.similarity<0||item.similarity>1))throw new Error("similarity values must be in [0,1]");
  if((input.validation||[]).some(item=>!Number.isFinite(item.similarity)||item.similarity<0||item.similarity>1))throw new Error("validation similarity values must be in [0,1]");
  const minimum=input.minimumPerClass??3;
  let threshold:number|null=null,balancedAccuracy:number|null=null;
  if(positives>=minimum&&negatives>=minimum){
    const sorted=[...new Set(input.calibration.map(item=>item.similarity))].sort((a,b)=>a-b);
    const candidates=[0,...sorted.slice(1).map((value,index)=>(sorted[index]+value)/2),1];
    let best=-Infinity;
    for(const candidate of candidates){let tp=0,tn=0;for(const item of input.calibration){if(item.matches?item.similarity>=candidate:item.similarity<candidate){if(item.matches)tp++;else tn++;}}const score=((tp/positives)+(tn/negatives))/2;if(score>best){best=score;threshold=candidate;}}
    balancedAccuracy=best;
    if(best<=.5)threshold=null;
  }
  const validation=input.validation||[];let validationBalancedAccuracy:number|null=null;
  if(threshold!==null){const vp=validation.filter(item=>item.matches).length,vn=validation.length-vp;if(vp&&vn){let tp=0,tn=0;for(const item of validation){if(item.matches?item.similarity>=threshold:item.similarity<threshold){if(item.matches)tp++;else tn++;}}validationBalancedAccuracy=((tp/vp)+(tn/vn))/2;}}
  return {...input.scope,version:input.version,threshold,sampleCount:input.calibration.length,positiveCount:positives,negativeCount:negatives,balancedAccuracy,status:threshold===null?"insufficient":"calibrated",fixtureHash:input.fixtureHash,validationBalancedAccuracy};
}

export const RATE_WINDOWS_SECONDS=[120,300,600,1200,3600,21600,86400] as const;
export type LifecycleStage="SEED"|"EMERGING"|"BREAKOUT"|"MAINSTREAM"|"SATURATED"|"DECAY";
export type LifecycleResult={ version:string; stage:LifecycleStage; emergence:number|null; confidence:Confidence; observationCount:number; uniqueAuthors:number; windows:Array<{seconds:number; observations:number; uniqueAuthors:number; ratePerMinute:number}>; reasons:string[]; baselineCoverage:number };
export function classifyEventLifecycle(input:{observations:Array<Pick<XObservation,"authorId"|"observedAt">>; now:number; historicalRateMedian?:number|null; historicalRateMad?:number|null; historicalSamples?:number; saturationThreshold?:number; decayWindowSeconds?:number}):LifecycleResult{
  const observations=[...input.observations].filter(item=>Number.isFinite(item.observedAt)&&item.observedAt<=input.now).sort((a,b)=>a.observedAt-b.observedAt);
  const uniqueAuthors=new Set(observations.map(item=>item.authorId)).size;
  const windows=RATE_WINDOWS_SECONDS.map(seconds=>{const recent=observations.filter(item=>item.observedAt>=input.now-seconds);return {seconds,observations:recent.length,uniqueAuthors:new Set(recent.map(item=>item.authorId)).size,ratePerMinute:recent.length/(seconds/60)}});
  const baselinePresent=input.historicalRateMedian!==null&&input.historicalRateMedian!==undefined&&input.historicalRateMad!==null&&input.historicalRateMad!==undefined&&Number.isFinite(input.historicalRateMedian)&&Number.isFinite(input.historicalRateMad);
  const baselineCoverage=baselinePresent?Math.min(1,Math.max(0,(input.historicalSamples||0)/20)):0;
  const confidenceClass:Confidence=baselineCoverage>=.8?"high":baselineCoverage>=.5?"moderate":baselineCoverage>0?"low":"insufficient";
  let emergence:number|null=null;
  if(baselinePresent&&(input.historicalSamples||0)>=5){
    const current=windows.find(window=>window.seconds===600)!.ratePerMinute;
    const scale=Math.max(input.historicalRateMad!,1/600);
    const robustSurprise=Math.max(0,(current-input.historicalRateMedian!)/(1.4826*scale));
    const independentArrival=Math.min(1,uniqueAuthors/5);
    emergence=Math.max(0,Math.min(1,(robustSurprise/(robustSurprise+3))*.7+independentArrival*.3));
  }
  const recent=windows.find(window=>window.seconds===600)!; const short=windows.find(window=>window.seconds===120)!; const long=windows.find(window=>window.seconds===3600)!;
  const age=observations.length?input.now-observations[0].observedAt:0;
  const reasons:string[]=[]; let stage:LifecycleStage="SEED";
  if(observations.length===0)reasons.push("no observations");
  else if(age>(input.decayWindowSeconds??86400)&&recent.observations===0){stage="DECAY";reasons.push("no recent arrivals beyond configured decay window");}
  else if(uniqueAuthors>=20&&long.observations>=50){stage="MAINSTREAM";reasons.push("source diversity and one-hour volume crossed explicit thresholds");}
  else if(observations.length>=(input.saturationThreshold??100)&&new Set(observations.filter(item=>item.observedAt>=input.now-3600).map(item=>item.authorId)).size<5){stage="SATURATED";reasons.push("volume threshold reached with low recent author arrival");}
  else if(emergence!==null&&emergence>=.75&&short.observations>=3){stage="BREAKOUT";reasons.push("robust emergence threshold and two-minute activity threshold crossed");}
  else if(emergence!==null&&emergence>=.35&&recent.observations>=3){stage="EMERGING";reasons.push("robust emergence threshold and ten-minute activity threshold crossed");}
  else reasons.push(emergence===null?"historical baseline unavailable or too small": "configured emergence thresholds not crossed");
  return {version:EVENT_INTELLIGENCE_VERSION,stage,emergence,confidence:confidenceClass,observationCount:observations.length,uniqueAuthors,windows,reasons,baselineCoverage};
}

export type LineageObservation=Pick<XObservation,"xPostId"|"authorId"|"authorHandle"|"observedAt"|"textSnapshot"|"urls"|"referencedPosts">;
export type EvidencePattern={version:string;classification:"broadcast"|"organic_cascade"|"coordinated_cluster"|"mixed"|"unknown";observationCount:number;distinctAuthors:number;independentRoots:number;rootCounts:Array<{rootId:string;count:number}>;coordinationLikelihood:number;independenceWeight:number;limitations:string[]};
function normalize(text:string):string{return text.toLocaleLowerCase().normalize("NFKC").replace(/https?:\/\/\S+/g," ").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");}
function similarity(a:string,b:string):number{const left=new Set(normalize(a).split(" ").filter(Boolean)),right=new Set(normalize(b).split(" ").filter(Boolean));if(!left.size&&!right.size)return 1;let intersection=0;for(const item of left)if(right.has(item))intersection++;return intersection/(left.size+right.size-intersection||1);}
function evidenceRoot(observation:LineageObservation):string{
  const ref=observation.referencedPosts?.find(item=>item.kind==="repost_of"||item.kind==="quote_of"||item.kind==="conversation_root"||item.kind==="reply_to");
  if(ref)return ref.xPostId;
  const url=observation.urls?.map(value=>value.trim().toLowerCase()).filter(Boolean).sort()[0];
  return url?`url:${url}`:observation.xPostId;
}
/** Conservative X-lineage grouping. It never claims bot identity or truth. */
export function classifyEvidencePattern(observations:readonly LineageObservation[]):EvidencePattern{
  const roots=new Map<string,number>();for(const item of observations){const root=evidenceRoot(item);roots.set(root,(roots.get(root)||0)+1);}
  const authors=new Set(observations.map(item=>item.authorId));const rootCounts=[...roots].map(([rootId,count])=>({rootId,count})).sort((a,b)=>b.count-a.count);
  const sameRoot=observations.length?Math.max(...rootCounts.map(item=>item.count)):0;
  let similarPairs=0,closeSimilarPairs=0,pairs=0;
  for(let i=0;i<observations.length;i++)for(let j=i+1;j<observations.length;j++){
    pairs++;const sim=similarity(observations[i].textSnapshot,observations[j].textSnapshot);
    if(sim>=.9){similarPairs++;if(Math.abs(observations[i].observedAt-observations[j].observedAt)<=120)closeSimilarPairs++;}
  }
  const coordinationLikelihood=pairs?Math.min(1,(closeSimilarPairs/pairs)*Math.min(1,authors.size/3)):0;
  const repeatedRoot=observations.length>=3&&sameRoot/observations.length>=.7;
  const coordinated=observations.length>=3&&authors.size>=3&&coordinationLikelihood>=.6;
  const classification:EvidencePattern["classification"]=observations.length<2?"unknown":coordinated?"coordinated_cluster":repeatedRoot?"broadcast":roots.size>=3&&authors.size>=3?"organic_cascade":roots.size>1&&sameRoot/observations.length>=.5?"mixed":"unknown";
  const independenceWeight=observations.length?Math.max(0,Math.min(1,(roots.size/observations.length)*(1-coordinationLikelihood))):0;
  const limitations:string[]=[];if(authors.size<3)limitations.push("too few distinct authors to assess coordination");if(!observations.some(item=>item.urls?.length))limitations.push("URL lineage unavailable in supplied observations");if(similarPairs===0)limitations.push("text-copy signal not observed; other coordination signals were not assessed");limitations.push("account graph, posting-order and external-content evidence unavailable; this is not a bot or truth label");
  return {version:EVENT_INTELLIGENCE_VERSION,classification,observationCount:observations.length,distinctAuthors:authors.size,independentRoots:roots.size,rootCounts,coordinationLikelihood,independenceWeight,limitations};
}

export type ReputationOutcome={sourceHandle:string;topicId:string;eventFamilyId:string;outcome:"useful"|"false_positive"|"missed";leadSeconds:number|null;coordinationLikelihood?:number};
export type SourceTopicReputation={version:string;sourceHandle:string;topicId:string;rawSignals:number;independentFamilies:number;effectiveSampleSize:number;useful:number;failures:number;posterior:number;confidence:Confidence;medianLeadSeconds:number|null;leadSamples:number;prior:{alpha:number;beta:number}};
function wilsonConfidence(effective:number):Confidence{return effective>=30?"high":effective>=10?"moderate":effective>=3?"low":"insufficient";}
/** Beta prior shrinkage over capped per-event-family evidence; coordination discounts weight, not author identity. */
export function scoreSourceTopicReputation(outcomes:ReputationOutcome[],prior={alpha:2,beta:2}):SourceTopicReputation[]{
  if(!(prior.alpha>0&&prior.beta>0))throw new Error("reputation prior must be positive");
  const groups=new Map<string,ReputationOutcome[]>();for(const outcome of outcomes){const key=`${outcome.sourceHandle.toLowerCase()}\u0000${outcome.topicId}\u0000${outcome.eventFamilyId}`;const group=groups.get(key)||[];group.push(outcome);groups.set(key,group);}
  const aggregates=new Map<string,{source:string;topic:string;raw:number;effective:number;useful:number;failures:number;leads:number[]}>();
  for(const [key,group] of groups){const [source,topic]=key.split("\u0000");const aggregateKey=`${source}\u0000${topic}`;const item=aggregates.get(aggregateKey)||{source,topic,raw:0,effective:0,useful:0,failures:0,leads:[]};item.raw+=group.length;
    let total=0,success=0,failure=0;const leads:number[]=[];
    for(const outcome of group){const weight=Math.max(0,Math.min(1,1-(outcome.coordinationLikelihood||0)));total+=weight;if(outcome.outcome==="useful")success+=weight;else failure+=weight;if(outcome.leadSeconds!==null&&Number.isFinite(outcome.leadSeconds))leads.push(outcome.leadSeconds);}
    const cap=Math.min(1,total);if(total>0){item.effective+=cap;item.useful+=success/total*cap;item.failures+=failure/total*cap;}
    const familyLead=median(leads);if(familyLead!==null)item.leads.push(familyLead);
    aggregates.set(aggregateKey,item);
  }
  return [...aggregates.values()].map(item=>({version:EVENT_INTELLIGENCE_VERSION,sourceHandle:item.source,topicId:item.topic,rawSignals:item.raw,independentFamilies:groups.size?new Set([...groups.keys()].filter(key=>key.startsWith(`${item.source}\u0000${item.topic}\u0000`))).size:0,effectiveSampleSize:item.effective,useful:item.useful,failures:item.failures,posterior:(prior.alpha+item.useful)/(prior.alpha+prior.beta+item.effective),confidence:wilsonConfidence(item.effective),medianLeadSeconds:median(item.leads),leadSamples:item.leads.length,prior}));
}
