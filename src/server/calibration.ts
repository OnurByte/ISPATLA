import { listEvaluationLabels, saveCalibrationProfile, saveEvaluationReplay, sha256, latestCalibrationProfile, type OutcomeLabel } from "@/server/evaluation-store";

export type CalibrationPoint = { score:number; hit:boolean; groupId:string };
export type ReliabilityBin = { lower:number; upper:number; count:number; meanPrediction:number; observedRate:number; wilson95:[number,number] };
export type IsotonicProfile = { status:"calibrated"|"insufficient"; mapping:Array<{upperScore:number;probability:number;count:number}>; sampleCount:number; minimumSamples:number };
function validScore(score:number):void { if(!Number.isFinite(score)) throw new Error("calibration score must be finite"); }
function wilson(successes:number,n:number):[number,number] {
  if(!n)return [0,1]; const z=1.959963984540054,p=successes/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=(z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/d;
  return [Math.max(0,c-h),Math.min(1,c+h)];
}
function uniqueGroups<T extends {groupId:string;score:number;hit:boolean}>(points:T[]):T[] {
  const grouped=new Map<string,T[]>();
  for(const point of points)grouped.set(point.groupId,[...(grouped.get(point.groupId)??[]),point]);
  return [...grouped.values()].flatMap(rows=>{
    const first=rows[0];
    // Conflicting labels cannot be reconciled safely; repeated identical rows count once.
    if(rows.some(row=>row.hit!==first.hit))return [];
    return [first];
  });
}
/** Isotonic PAV maps an arbitrary decision score to an observed hit frequency. */
export function fitIsotonicCalibration(points:CalibrationPoint[],minimumSamples=100):IsotonicProfile {
  if(!Number.isInteger(minimumSamples)||minimumSamples<1)throw new Error("minimum sample count must be positive");
  if(points.some(point=>!point.groupId.trim()||typeof point.hit!=="boolean"||!Number.isFinite(point.score)))throw new Error("calibration points require finite scores, labels, and leakage groups");
  const unique=uniqueGroups(points);
  if(unique.length<minimumSamples) return {status:"insufficient",mapping:[],sampleCount:unique.length,minimumSamples};
  const sorted=[...unique].sort((a,b)=>a.score-b.score);
  const tied:Array<{min:number;max:number;hits:number;n:number}>=[];
  for(const point of sorted){
    const previous=tied[tied.length-1];
    if(previous?.max===point.score){previous.hits+=point.hit?1:0;previous.n++;}
    else tied.push({min:point.score,max:point.score,hits:point.hit?1:0,n:1});
  }
  const blocks:Array<{min:number;max:number;hits:number;n:number}>=[];
  for(const tiedBlock of tied){
    blocks.push(tiedBlock);
    while(blocks.length>1){
      const a=blocks[blocks.length-2],b=blocks[blocks.length-1];
      if(a.hits/a.n<=b.hits/b.n)break;
      blocks.splice(-2,2,{min:a.min,max:b.max,hits:a.hits+b.hits,n:a.n+b.n});
    }
  }
  return {status:"calibrated",sampleCount:unique.length,minimumSamples,mapping:blocks.map(block=>({upperScore:block.max,probability:block.hits/block.n,count:block.n}))};
}
export function calibratedProbability(score:number,profile:IsotonicProfile|{status:"calibrated"|"insufficient";mapping:Array<{upperScore:number;probability:number;count:number}>}): number|null {
  validScore(score); if(profile.status!=="calibrated"||!profile.mapping.length)return null;
  return (profile.mapping.find(bin=>score<=bin.upperScore)??profile.mapping[profile.mapping.length-1]).probability;
}
export function reliabilityMetrics(points:Array<{probability:number;hit:boolean;groupId?:string}>,binCount=10):{sampleCount:number;brier:number|null;logLoss:number|null;ece:number|null;reliability:ReliabilityBin[]} {
  if(!Number.isInteger(binCount)||binCount<1||binCount>50)throw new Error("bin count must be 1..50");
  for(const point of points)if(!Number.isFinite(point.probability)||point.probability<0||point.probability>1)throw new Error("probability must be in [0,1]");
  const grouped=new Map<string,typeof points>();
  for(const [index,point] of points.entries()){
    const key=point.groupId?.trim();
    if(key)grouped.set(key,[...(grouped.get(key)??[]),point]);
    else grouped.set(`row:${index}`,[point]);
  }
  const unique=[...grouped.values()].flatMap(rows=>rows.every(row=>row.hit===rows[0].hit&&row.probability===rows[0].probability)?[rows[0]]:[]);
  if(!unique.length)return {sampleCount:0,brier:null,logLoss:null,ece:null,reliability:[]};
  const buckets=Array.from({length:binCount},()=>[] as typeof unique);
  for(const point of unique)buckets[Math.min(binCount-1,Math.floor(point.probability*binCount))].push(point);
  const reliability=buckets.map((items,index)=>{const hits=items.filter(x=>x.hit).length;return {lower:index/binCount,upper:(index+1)/binCount,count:items.length,meanPrediction:items.length?items.reduce((s,x)=>s+x.probability,0)/items.length:0,observedRate:items.length?hits/items.length:0,wilson95:wilson(hits,items.length)};}).filter(bin=>bin.count>0);
  const brier=unique.reduce((sum,p)=>sum+(p.probability-(p.hit?1:0))**2,0)/unique.length;
  const logLoss=unique.reduce((sum,p)=>{const y=p.hit?1:0,v=Math.max(1e-15,Math.min(1-1e-15,p.probability));return sum-y*Math.log(v)-(1-y)*Math.log(1-v);},0)/unique.length;
  const ece=reliability.reduce((sum,bin)=>sum+bin.count/unique.length*Math.abs(bin.meanPrediction-bin.observedRate),0);
  return {sampleCount:unique.length,brier,logLoss,ece,reliability};
}
async function binaryLabels(modelKey:string,accountId:string,split:"calibration"|"holdout"):Promise<Array<{score:number;hit:boolean;groupId:string;ownerUserId:string;accountId:string;candidateId:string}>> {
  const rows=(await listEvaluationLabels(split,modelKey,accountId)).filter(item=>item.label==="hit"||item.label==="miss").map(item=>({score:item.prediction.rawScore,hit:item.label==="hit",groupId:item.prediction.leakageGroup,ownerUserId:item.prediction.ownerUserId,accountId:item.prediction.accountId,candidateId:item.prediction.candidateId}));
  const seen=new Map<string,typeof rows>();for(const row of rows)seen.set(row.groupId,[...(seen.get(row.groupId)??[]),row]);
  return [...seen.values()].flatMap(group=>group.every(row=>row.hit===group[0].hit)?[group[0]]:[]);
}
export async function calibrateStoredModel(input:{accountId:string;modelKey:string;minimumSamples?:number;now:number}):Promise<IsotonicProfile> {
  if(!input.accountId.trim()||!input.modelKey.trim())throw new Error("account and model scope required");
  const key=JSON.stringify([input.accountId,input.modelKey]);
  const labeled=await binaryLabels(input.modelKey,input.accountId,"calibration");
  const profile=fitIsotonicCalibration(labeled.map(row=>({score:row.score,hit:row.hit,groupId:row.groupId})),input.minimumSamples??100);
  const groups=labeled.map(x=>x.groupId); const ownerScopedHash=sha256({accountId:input.accountId,modelKey:input.modelKey,split:"calibration",groups:[...new Set(groups)].sort(),candidates:labeled.map(x=>x.candidateId).sort()});
  await saveCalibrationProfile({modelKey:key,mapping:profile.mapping,sampleCount:profile.sampleCount,calibrationGroupHash:ownerScopedHash,createdAt:input.now,status:profile.status});
  return profile;
}
export async function evaluateStoredHoldout(input:{accountId:string;modelKey:string;now:number}):Promise<{status:"calibrated"|"insufficient";sampleCount:number;brier:number|null;logLoss:number|null;ece:number|null;reliability:ReliabilityBin[];replayId:string|null}> {
  if(!input.accountId.trim()||!input.modelKey.trim())throw new Error("account and model scope required");
  const saved=await latestCalibrationProfile(JSON.stringify([input.accountId,input.modelKey])); const labels=await binaryLabels(input.modelKey,input.accountId,"holdout");
  // Persisted calibrator is used only if its calibration set is adequate; holdout rows never refit it.
  const profile=saved?.status==="calibrated"?{status:saved.status,mapping:saved.mapping}: {status:"insufficient" as const,mapping:[]};
  const points=labels.flatMap(row=>{const probability=calibratedProbability(row.score,profile);return probability===null?[]:[{probability,hit:row.hit,groupId:row.groupId}];});
  const metrics=reliabilityMetrics(points); const datasetHash=sha256({split:"holdout",accountId:input.accountId,modelKey:input.modelKey,ids:labels.map(x=>x.candidateId).sort(),calibrationGroupHash:saved?.groupHash??null});
  const first=labels[0]; const replayId=first?await saveEvaluationReplay({accountId:first.accountId,modelKey:input.modelKey,datasetHash,sampleCount:metrics.sampleCount,brier:metrics.brier,logLoss:metrics.logLoss,ece:metrics.ece,reliability:metrics.reliability,createdAt:input.now}):null;
  return {status:profile.status,sampleCount:metrics.sampleCount,brier:metrics.brier,logLoss:metrics.logLoss,ece:metrics.ece,reliability:metrics.reliability,replayId};
}
export function isBinaryOutcomeLabel(label:OutcomeLabel):boolean{return label==="hit"||label==="miss";}
