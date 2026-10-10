import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresDb } from "@/server/postgres";

type PostgresTransaction = Parameters<Parameters<ReturnType<typeof getPostgresDb>["transaction"]>[0]>[0];
const transactionDb = new AsyncLocalStorage<PostgresTransaction>();
const TABLES = ["evaluation_predictions", "evaluation_outcome_revisions", "evaluation_labels", "evaluation_replays", "evaluation_calibration_profiles", "autonomy_suggestions", "scoped_autonomy", "autonomy_audit", "publication_intents", "publication_approval_snapshots", "publication_intent_events", "drafts", "accounts", "x_oauth_accounts"] as const;

function quote(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function num(value: number): string { if (!Number.isFinite(value)) throw new Error("numeric values must be finite"); return String(value); }
function obj(value: unknown): string { return quote(JSON.stringify(value)); }
function qualify(query: string): string {
  for (const table of TABLES) query = query.replace(new RegExp(`\\b${table}\\b`, "g"), `ispatla_app.${table}`);
  return query.replace(/json_extract\(([^,]+),\s*'\$\.([^']+)'\)/g, "(($1)::jsonb ->> '$2')").replaceAll(" IS NOT 'eligible'", " IS DISTINCT FROM 'eligible'");
}
function db() { return transactionDb.getStore() ?? getPostgresDb(); }
async function rows<T>(query: string): Promise<T[]> { return (await db().execute(sql.raw(qualify(query)))).rows as T[]; }
async function exec(query: string): Promise<void> { await db().execute(sql.raw(qualify(query))); }
async function tx<T>(fn: () => Promise<T>, isolationLevel?: "serializable"): Promise<T> {
  return getPostgresDb().transaction((transaction) => transactionDb.run(transaction, fn), isolationLevel ? { isolationLevel } : undefined);
}
export function requireEvaluationOwner(): string {
  const owner = currentOwnerId();
  if (!owner) throw new Error("evaluation data requires a verified owner context");
  return owner;
}
export function ensureEvaluationStore(): true { return true; }

/** Accounts are resolved under the authenticated owner context before evaluation data is accepted. */
export async function requireEvaluationAccount(accountId: string): Promise<void> {
  const owner = requireEvaluationOwner();
  if (!/^\d+$/.test(accountId) || !Number.isSafeInteger(Number(accountId)) || !(await rows<{ id: string }>(`SELECT id FROM accounts WHERE id=${num(Number(accountId))} AND owner_user_id=${quote(owner)} LIMIT 1;`)).length) {
    throw new Error("evaluation account not found for owner");
  }
}

export type EvaluationSplit = "train" | "calibration" | "holdout";
export function splitLeakageGroup(groupId: string, seed = "ispatla-eval-v1"): EvaluationSplit {
  if (!groupId.trim()) throw new Error("leakage group is required");
  const bucket = createHash("sha256").update(`${seed}\0${groupId}`).digest().readUInt32BE(0) % 100;
  return bucket < 70 ? "train" : bucket < 85 ? "calibration" : "holdout";
}
export type EvaluationPredictionInput = {
  accountId: string; candidateId: string; leakageGroup: string; modelKey: string; rawScore: number;
  selectorVersion: string; selectionPropensity?: number | null; action: string; category: string; format: string;
  riskTier: string; features: Record<string, string | number | boolean | null>; createdAt: number; resolveBy: number;
};
export type EvaluationPrediction = EvaluationPredictionInput & { id: string; ownerUserId: string; split: EvaluationSplit };
export async function recordEvaluationPrediction(input: EvaluationPredictionInput): Promise<EvaluationPrediction> {
  ensureEvaluationStore(); const owner = requireEvaluationOwner();
  await requireEvaluationAccount(input.accountId);
  for (const value of [input.accountId,input.candidateId,input.leakageGroup,input.modelKey,input.selectorVersion,input.action,input.category,input.format,input.riskTier]) if (!value.trim()) throw new Error("prediction provenance and scope fields are required");
  if (input.resolveBy < input.createdAt) throw new Error("resolve-by must not precede prediction time");
  if (input.selectionPropensity != null && (!Number.isFinite(input.selectionPropensity) || input.selectionPropensity <= 0 || input.selectionPropensity > 1)) throw new Error("selection propensity must be in (0,1]");
  return tx(async () => {
  const id = randomUUID(), split = splitLeakageGroup(input.leakageGroup);
  await exec(`INSERT INTO evaluation_predictions(id,owner_user_id,account_id,candidate_id,leakage_group,model_key,raw_score,split,selector_version,selection_propensity,action,category,format,risk_tier,features_json,created_at,resolve_by) VALUES (${quote(id)},${quote(owner)},${quote(input.accountId)},${quote(input.candidateId)},${quote(input.leakageGroup)},${quote(input.modelKey)},${num(input.rawScore)},${quote(split)},${quote(input.selectorVersion)},${input.selectionPropensity == null ? "NULL" : num(input.selectionPropensity)},${quote(input.action)},${quote(input.category)},${quote(input.format)},${quote(input.riskTier)},${obj(input.features)},${num(input.createdAt)},${num(input.resolveBy)}) ON CONFLICT(owner_user_id,account_id,candidate_id,model_key) DO NOTHING;`);
  const stored = (await rows<Record<string, unknown>>(`SELECT * FROM evaluation_predictions WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND candidate_id=${quote(input.candidateId)} AND model_key=${quote(input.modelKey)};`))[0];
  if (!stored) throw new Error("evaluation prediction insert failed");
  if (stored.leakage_group !== input.leakageGroup || stored.split !== split) throw new Error("candidate already exists with conflicting leakage group");
  return mapPrediction(stored);
  });
}
function mapPrediction(row: Record<string, unknown>): EvaluationPrediction {
  return { id:String(row.id),ownerUserId:String(row.owner_user_id),accountId:String(row.account_id),candidateId:String(row.candidate_id),leakageGroup:String(row.leakage_group),modelKey:String(row.model_key),rawScore:Number(row.raw_score),split:row.split as EvaluationSplit,selectorVersion:String(row.selector_version),selectionPropensity:row.selection_propensity==null?null:Number(row.selection_propensity),action:String(row.action),category:String(row.category),format:String(row.format),riskTier:String(row.risk_tier),features:JSON.parse(String(row.features_json)),createdAt:Number(row.created_at),resolveBy:Number(row.resolve_by) };
}
export async function getEvaluationPrediction(id: string): Promise<EvaluationPrediction | null> { ensureEvaluationStore(); const owner=requireEvaluationOwner(); const row=(await rows<Record<string,unknown>>(`SELECT * FROM evaluation_predictions WHERE id=${quote(id)} AND owner_user_id=${quote(owner)};`))[0]; return row?mapPrediction(row):null; }
export async function listEvaluationPredictions(accountId?:string,modelKey?:string,limit=100):Promise<EvaluationPrediction[]> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();if(accountId!==undefined)await requireEvaluationAccount(accountId);if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("limit must be between 1 and 500");
  const where=[`owner_user_id=${quote(owner)}`];if(accountId!==undefined)where.push(`account_id=${quote(accountId)}`);if(modelKey!==undefined)where.push(`model_key=${quote(modelKey)}`);
  return (await rows<Record<string,unknown>>(`SELECT * FROM evaluation_predictions WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ${limit};`)).map(mapPrediction);
}
/** Returns all persisted classifications for a candidate so execution can fail closed on disagreement. */
export async function listSourceCandidateEvaluationPredictions(accountId:string,sourceCandidateId:string):Promise<EvaluationPrediction[]> {
  ensureEvaluationStore();await requireEvaluationAccount(accountId);const owner=requireEvaluationOwner();
  return (await rows<Record<string,unknown>>(`SELECT * FROM evaluation_predictions WHERE owner_user_id=${quote(owner)} AND account_id=${quote(accountId)} AND json_extract(features_json,'$.sourceCandidateId')=${quote(sourceCandidateId)} ORDER BY id;`)).map(mapPrediction);
}
export async function listDueUnresolvedPredictions(now: number, limit = 100, filter:{accountId?:string;modelKey?:string}={}): Promise<EvaluationPrediction[]> {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); if (!Number.isInteger(limit)||limit<1||limit>500) throw new Error("limit must be between 1 and 500");
  if(filter.accountId!==undefined)await requireEvaluationAccount(filter.accountId);
  const where=[`p.owner_user_id=${quote(owner)}`,`p.resolve_by<=${num(now)}`,`NOT EXISTS(SELECT 1 FROM evaluation_labels l WHERE l.owner_user_id=p.owner_user_id AND l.prediction_id=p.id)`];
  if(filter.accountId!==undefined)where.push(`p.account_id=${quote(filter.accountId)}`);if(filter.modelKey!==undefined)where.push(`p.model_key=${quote(filter.modelKey)}`);
  return (await rows<Record<string,unknown>>(`SELECT p.* FROM evaluation_predictions p WHERE ${where.join(" AND ")} ORDER BY p.resolve_by,p.id LIMIT ${limit};`)).map(mapPrediction);
}

export type DuePublicationOutcome = { prediction: EvaluationPrediction; accountId: number; remoteReceipt: string; remoteUrl: string; observationWindow:"day"|"resolved" };
/** Owner-scoped confirmed publications ready for official metric capture. Filter before LIMIT so old rejected/unmatched predictions cannot starve eligible rows. */
export async function listDuePublicationOutcomes(now: number, limit = 100): Promise<DuePublicationOutcome[]> {
  ensureEvaluationStore(); const owner = requireEvaluationOwner();
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("limit must be between 1 and 500");
  const matches = await rows<Record<string, unknown>>(`SELECT p.*, i.account_id AS intent_account_id, i.receipt AS remote_receipt, i.remote_url AS remote_url, CASE WHEN i.confirmed_at+108000>=${num(now)} THEN 'day' ELSE 'resolved' END AS observation_window
    FROM evaluation_predictions p
    JOIN drafts d ON d.owner_user_id=p.owner_user_id
    JOIN publication_intents i ON i.draft_id=d.id AND i.account_id=CAST(p.account_id AS INTEGER)
      AND i.status='confirmed' AND i.confirmed_at IS NOT NULL AND i.confirmed_at+86400<=${num(now)}
      AND p.created_at<=i.requested_at
    JOIN publication_approval_snapshots s ON s.id=i.approval_snapshot_id AND s.entity_type='publication_intent'
      AND s.entity_id=i.id AND s.draft_id=d.id AND s.account_id=i.account_id
      AND s.external_id=json_extract(p.features_json,'$.sourceCandidateId')
      AND s.text=i.text AND s.action='post' AND s.approved_at>=p.created_at AND s.expires_at>=COALESCE(i.dispatched_at,i.confirmed_at)
    JOIN accounts a ON a.id=i.account_id AND a.owner_user_id=p.owner_user_id
    WHERE p.owner_user_id=${quote(owner)} AND json_extract(p.features_json,'$.decision')='eligible'
      AND NOT EXISTS(SELECT 1 FROM evaluation_labels l WHERE l.owner_user_id=p.owner_user_id AND l.prediction_id=p.id)
      AND ((i.confirmed_at+108000>=${num(now)} AND NOT EXISTS(SELECT 1 FROM evaluation_outcome_revisions o WHERE o.owner_user_id=p.owner_user_id AND o.prediction_id=p.id))
        OR (i.confirmed_at+1209600<=${num(now)} AND p.resolve_by<=${num(now)} AND NOT EXISTS(SELECT 1 FROM evaluation_outcome_revisions o WHERE o.owner_user_id=p.owner_user_id AND o.prediction_id=p.id AND o.observed_at>=i.confirmed_at+1209600)))
      AND NOT EXISTS(SELECT 1 FROM evaluation_predictions newer WHERE newer.owner_user_id=p.owner_user_id
        AND newer.account_id=p.account_id AND json_extract(newer.features_json,'$.sourceCandidateId')=json_extract(p.features_json,'$.sourceCandidateId')
        AND json_extract(newer.features_json,'$.decision')='eligible' AND newer.created_at>p.created_at AND newer.created_at<=i.requested_at)
    ORDER BY CASE WHEN i.confirmed_at+108000>=${num(now)} THEN 0 ELSE 1 END,i.confirmed_at,p.resolve_by,p.id LIMIT ${limit};`);
  return matches.map((row) => ({ prediction: mapPrediction(row), accountId: Number(row.intent_account_id), remoteReceipt: String(row.remote_receipt || ""), remoteUrl: String(row.remote_url || ""), observationWindow:row.observation_window as "day"|"resolved" }));
}

export type OfficialFollowerEvidence = { count:number; observedAt:number; xUserId:string; provenanceRef:string };
export type XOutcomeInput = { predictionId: string; capturedAt: number; observedAt: number; metrics: { views:number|null;likes:number|null;replies:number|null;reposts:number|null;quotes:number|null }; censored?: string[]; followersEvidence?:OfficialFollowerEvidence|null; source:"official_x_api"|"human_review"; provenanceRef:string };
export async function appendObservedOutcome(input: XOutcomeInput): Promise<number> {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); const prediction=await getEvaluationPrediction(input.predictionId);
  if (!prediction) throw new Error("prediction not found for owner");
  if (!input.provenanceRef.trim() || !Number.isFinite(input.capturedAt) || !Number.isFinite(input.observedAt)) throw new Error("outcome timestamp and provenance are required");
  const allowed=new Set(["views","likes","replies","reposts","quotes"]); if ((input.censored||[]).some(x=>!allowed.has(x))) throw new Error("unknown censored metric");
  for(const [key,value] of Object.entries(input.metrics)) if(value!==null&&(!Number.isFinite(value)||value<0)) throw new Error(`invalid ${key} outcome`);
  if(input.observedAt<prediction.createdAt || input.capturedAt<input.observedAt) throw new Error("outcome chronology is invalid");
  const followers=input.followersEvidence;
  return tx(async () => {
  if (followers) {
    const account=(await rows<{x_user_id:string|null}>(`SELECT x_user_id FROM x_oauth_accounts WHERE account_id=${num(Number(prediction.accountId))} AND owner_user_id=${quote(owner)};`))[0];
    if(input.source!=="official_x_api" || !Number.isSafeInteger(followers.count) || followers.count<0 || followers.observedAt!==input.observedAt || !/^\d+$/.test(followers.xUserId) || account?.x_user_id!==followers.xUserId || followers.provenanceRef!==`official_x_user:${prediction.accountId}:${followers.xUserId}`) throw new Error("invalid official follower evidence");
  }
  const previous=(await rows<{captured_at:number;observed_at:number}>(`SELECT captured_at,observed_at FROM evaluation_outcome_revisions WHERE owner_user_id=${quote(owner)} AND prediction_id=${quote(input.predictionId)} ORDER BY captured_at DESC,id DESC LIMIT 1;`))[0];
  if(previous&&(input.capturedAt<=previous.captured_at||input.observedAt<previous.observed_at)) throw new Error("outcome revisions must append in observed and captured time order");
  const inserted=await rows<{id:number}>(`INSERT INTO evaluation_outcome_revisions(owner_user_id,prediction_id,captured_at,observed_at,views,likes,replies,reposts,quotes,censored_json,source,provenance_ref,followers_count,followers_observed_at,followers_x_user_id,followers_provenance_ref) VALUES (${quote(owner)},${quote(input.predictionId)},${num(input.capturedAt)},${num(input.observedAt)},${input.metrics.views===null?"NULL":num(input.metrics.views)},${input.metrics.likes===null?"NULL":num(input.metrics.likes)},${input.metrics.replies===null?"NULL":num(input.metrics.replies)},${input.metrics.reposts===null?"NULL":num(input.metrics.reposts)},${input.metrics.quotes===null?"NULL":num(input.metrics.quotes)},${obj(input.censored||[])},${quote(input.source)},${quote(input.provenanceRef)},${followers?num(followers.count):"NULL"},${followers?num(followers.observedAt):"NULL"},${followers?quote(followers.xUserId):"NULL"},${followers?quote(followers.provenanceRef):"NULL"}) RETURNING id;`);
  return Number(inserted[0].id);
  });
}
export async function listEvaluationOutcomes(predictionId:string):Promise<Array<{capturedAt:number;observedAt:number;metrics:{views:number|null;likes:number|null;replies:number|null;reposts:number|null;quotes:number|null};censored:string[];source:string;provenanceRef:string;followersEvidence:OfficialFollowerEvidence|null}>> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();if(!await getEvaluationPrediction(predictionId))throw new Error("prediction not found for owner");
  return (await rows<Record<string,unknown>>(`SELECT * FROM evaluation_outcome_revisions WHERE owner_user_id=${quote(owner)} AND prediction_id=${quote(predictionId)} ORDER BY captured_at,id;`)).map(row=>({capturedAt:Number(row.captured_at),observedAt:Number(row.observed_at),metrics:{views:row.views==null?null:Number(row.views),likes:row.likes==null?null:Number(row.likes),replies:row.replies==null?null:Number(row.replies),reposts:row.reposts==null?null:Number(row.reposts),quotes:row.quotes==null?null:Number(row.quotes)},censored:JSON.parse(String(row.censored_json)),source:String(row.source),provenanceRef:String(row.provenance_ref),followersEvidence:row.followers_count==null?null:{count:Number(row.followers_count),observedAt:Number(row.followers_observed_at),xUserId:String(row.followers_x_user_id),provenanceRef:String(row.followers_provenance_ref)}}));
}
export type OutcomeLabel = "hit"|"miss"|"late_hit"|"wrong_account"|"wrong_format"|"policy_block"|"publisher_failure"|"cannibalization";
export async function adjudicateEvaluationPrediction(input:{predictionId:string;label:OutcomeLabel;reviewerRef:string;labeledAt:number}): Promise<void> {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); if(!await getEvaluationPrediction(input.predictionId)) throw new Error("prediction not found for owner");
  if(!input.reviewerRef.trim()||!Number.isFinite(input.labeledAt)) throw new Error("human label provenance required");
  await exec(`INSERT INTO evaluation_labels(owner_user_id,prediction_id,label,reviewer_ref,labeled_at) VALUES (${quote(owner)},${quote(input.predictionId)},${quote(input.label)},${quote(input.reviewerRef)},${num(input.labeledAt)});`);
}
export async function listEvaluationLabels(split?: EvaluationSplit, modelKey?: string, accountId?:string): Promise<Array<{prediction:EvaluationPrediction;label:OutcomeLabel}>> {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); if(accountId)await requireEvaluationAccount(accountId); const where=[`p.owner_user_id=${quote(owner)}`]; if(split)where.push(`p.split=${quote(split)}`); if(modelKey)where.push(`p.model_key=${quote(modelKey)}`); if(accountId)where.push(`p.account_id=${quote(accountId)}`);
  return (await rows<Record<string,unknown>>(`SELECT p.*,l.label FROM evaluation_predictions p JOIN evaluation_labels l ON l.prediction_id=p.id AND l.owner_user_id=p.owner_user_id WHERE ${where.join(" AND ")} ORDER BY p.created_at,p.id;`)).map(row=>({prediction:mapPrediction(row),label:row.label as OutcomeLabel}));
}
export async function saveEvaluationReplay(input:{accountId:string;modelKey:string;datasetHash:string;sampleCount:number;brier:number|null;logLoss:number|null;ece:number|null;reliability:unknown;createdAt:number}): Promise<string> {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); await requireEvaluationAccount(input.accountId); const id=randomUUID();
  if(!input.accountId.trim()||!input.modelKey.trim()||!input.datasetHash.trim()||!Number.isInteger(input.sampleCount)||input.sampleCount<0) throw new Error("replay provenance is required");
  await exec(`INSERT INTO evaluation_replays(id,owner_user_id,account_id,model_key,dataset_hash,split,sample_count,brier,log_loss,ece,reliability_json,created_at) VALUES (${quote(id)},${quote(owner)},${quote(input.accountId)},${quote(input.modelKey)},${quote(input.datasetHash)},'holdout',${num(input.sampleCount)},${input.brier==null?"NULL":num(input.brier)},${input.logLoss==null?"NULL":num(input.logLoss)},${input.ece==null?"NULL":num(input.ece)},${obj(input.reliability)},${num(input.createdAt)});`);
  return id;
}
export type EvaluationReplay={id:string;accountId:string;modelKey:string;datasetHash:string;split:"holdout";sampleCount:number;brier:number|null;logLoss:number|null;ece:number|null;reliability:unknown;createdAt:number};
export async function listEvaluationReplays(accountId?:string,modelKey?:string,limit=100):Promise<EvaluationReplay[]> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();if(accountId!==undefined)await requireEvaluationAccount(accountId);if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("limit must be between 1 and 500");
  const where=[`owner_user_id=${quote(owner)}`];if(accountId!==undefined)where.push(`account_id=${quote(accountId)}`);if(modelKey!==undefined)where.push(`model_key=${quote(modelKey)}`);
  return (await rows<Record<string,unknown>>(`SELECT * FROM evaluation_replays WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ${limit};`)).map(row=>({id:String(row.id),accountId:String(row.account_id),modelKey:String(row.model_key),datasetHash:String(row.dataset_hash),split:"holdout",sampleCount:Number(row.sample_count),brier:row.brier==null?null:Number(row.brier),logLoss:row.log_loss==null?null:Number(row.log_loss),ece:row.ece==null?null:Number(row.ece),reliability:JSON.parse(String(row.reliability_json)),createdAt:Number(row.created_at)}));
}
export async function saveCalibrationProfile(input:{modelKey:string;mapping:Array<{upperScore:number;probability:number;count:number}>;sampleCount:number;calibrationGroupHash:string;createdAt:number;status:"calibrated"|"insufficient"}): Promise<void> {
  ensureEvaluationStore(); const owner=requireEvaluationOwner();
  await exec(`INSERT INTO evaluation_calibration_profiles(owner_user_id,model_key,mapping_json,sample_count,group_hash,status,created_at) VALUES (${quote(owner)},${quote(input.modelKey)},${obj(input.mapping)},${num(input.sampleCount)},${quote(input.calibrationGroupHash)},${quote(input.status)},${num(input.createdAt)});`);
}
export async function latestCalibrationProfile(modelKey:string): Promise<{mapping:Array<{upperScore:number;probability:number;count:number}>;sampleCount:number;groupHash:string;status:"calibrated"|"insufficient"}|null> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();
  const row=(await rows<Record<string,unknown>>(`SELECT * FROM evaluation_calibration_profiles WHERE owner_user_id=${quote(owner)} AND model_key=${quote(modelKey)} ORDER BY id DESC LIMIT 1;`))[0];
  return row?{mapping:JSON.parse(String(row.mapping_json)),sampleCount:Number(row.sample_count),groupHash:String(row.group_hash),status:row.status as "calibrated"|"insufficient"}:null;
}
export function sha256(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export type AutonomyScope = { accountId:string; action:string; category:string; riskTier:string };
export type AutonomyModelPin = { modelKey:string; selectorVersion:string };
export type AutonomyEvidence = AutonomyScope & { createdAt:number };
async function validateAutonomyScope(scope:AutonomyScope):Promise<void> {
  await requireEvaluationAccount(scope.accountId);
  if (![scope.action,scope.category,scope.riskTier].every(value=>value.trim())) throw new Error("autonomy scope is required");
}
async function currentAutonomyModelPin(input:AutonomyScope):Promise<AutonomyModelPin|null> {
  const owner=requireEvaluationOwner();
  const row=(await rows<{model_key:string;selector_version:string}>(`SELECT model_key,selector_version FROM evaluation_predictions
    WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)}
    ORDER BY created_at DESC,id DESC LIMIT 1;`))[0];
  return row?.model_key&&row.selector_version?{modelKey:String(row.model_key),selectorVersion:String(row.selector_version)}:null;
}
export async function getAutonomyEvidence(input:AutonomyScope,pin?:AutonomyModelPin):Promise<{cleanApprovals:number;policyFailures:number;authFailures:number;duplicateIncidents:number;unacceptableOutcomes:number;evidenceHash:string;modelKey:string|null;selectorVersion:string|null}> {
  ensureEvaluationStore();await validateAutonomyScope(input);
  const owner=requireEvaluationOwner();
  const modelPin=pin??await currentAutonomyModelPin(input);
  const modelFilter=modelPin?`AND p.model_key=${quote(modelPin.modelKey)} AND p.selector_version=${quote(modelPin.selectorVersion)}`:"AND 1=0";
  const approvals=await rows<{id:number}>(`SELECT DISTINCT intent.id
    FROM publication_intents intent
    JOIN publication_approval_snapshots approval ON approval.id=intent.approval_snapshot_id
      AND approval.entity_type='publication_intent' AND approval.entity_id=intent.id AND approval.draft_id=intent.draft_id
      AND approval.approval_source='human' AND approval.account_id=intent.account_id AND approval.action=${quote(input.action)}
      AND approval.text=intent.text AND approval.expires_at>=intent.confirmed_at
    JOIN drafts d ON d.id=intent.draft_id
    JOIN accounts a ON a.id=intent.account_id
    JOIN evaluation_predictions p ON p.owner_user_id=d.owner_user_id AND p.account_id=CAST(intent.account_id AS TEXT)
      AND json_extract(p.features_json,'$.sourceCandidateId')=approval.external_id AND p.format=approval.format
      AND p.created_at<=approval.approved_at
    WHERE d.owner_user_id=${quote(owner)} AND a.owner_user_id=${quote(owner)} AND intent.account_id=${num(Number(input.accountId))}
      AND intent.status='confirmed' AND intent.approved_at IS NOT NULL AND intent.confirmed_at IS NOT NULL
      AND p.action=${quote(input.action)} AND p.category=${quote(input.category)} AND p.risk_tier='low' AND p.risk_tier=${quote(input.riskTier)}
      ${modelFilter}
      AND json_extract(p.features_json,'$.decision')='eligible'
      AND NOT EXISTS(SELECT 1 FROM evaluation_predictions other
        WHERE other.owner_user_id=p.owner_user_id AND other.account_id=p.account_id
          AND json_extract(other.features_json,'$.sourceCandidateId')=approval.external_id AND other.created_at<=approval.approved_at
          AND other.model_key=p.model_key AND other.selector_version=p.selector_version
          AND (other.action<>${quote(input.action)} OR other.category<>${quote(input.category)} OR other.risk_tier<>'low'
            OR json_extract(other.features_json,'$.decision') IS NOT 'eligible'));`);
  const incidents=await rows<{label:string;count:number}>(`SELECT l.label,COUNT(*) count FROM evaluation_labels l JOIN evaluation_predictions p ON p.id=l.prediction_id AND p.owner_user_id=l.owner_user_id WHERE p.owner_user_id=${quote(owner)} AND p.account_id=${quote(input.accountId)} AND p.action=${quote(input.action)} AND p.category=${quote(input.category)} ${modelPin?`AND p.model_key=${quote(modelPin.modelKey)} AND p.selector_version=${quote(modelPin.selectorVersion)}`:"AND 1=0"} AND l.label IN ('policy_block','wrong_account','wrong_format','publisher_failure','cannibalization') GROUP BY l.label;`);
  const dispatchIncidents=await rows<{kind:string;count:number}>(`SELECT CASE WHEN intent.status='blocked' OR event.error_class='policy_blocked' THEN 'policy' WHEN event.error_class='reauth' THEN 'auth' ELSE 'other' END kind,COUNT(*) count FROM publication_intents intent JOIN drafts d ON d.id=intent.draft_id JOIN evaluation_predictions p ON p.owner_user_id=d.owner_user_id AND p.account_id=CAST(intent.account_id AS TEXT) AND json_extract(p.features_json,'$.sourceCandidateId')=d.external_id JOIN publication_intent_events event ON event.intent_id=intent.id WHERE d.owner_user_id=${quote(owner)} AND intent.account_id=${num(Number(input.accountId))} AND p.action=${quote(input.action)} AND p.category=${quote(input.category)} ${modelPin?`AND p.model_key=${quote(modelPin.modelKey)} AND p.selector_version=${quote(modelPin.selectorVersion)}`:"AND 1=0"} AND (intent.status='blocked' OR event.error_class IN ('policy_blocked','reauth')) GROUP BY kind;`);
  const audit=await rows<{reason:string;count:number}>(`SELECT reason,COUNT(*) count FROM autonomy_audit WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)} AND event='demoted' GROUP BY reason;`);
  const counts={cleanApprovals:approvals.length,policyFailures:incidents.filter(x=>x.label==='policy_block').reduce((n,x)=>n+Number(x.count),0)+dispatchIncidents.filter(x=>x.kind==='policy').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='policy_failure').reduce((n,x)=>n+Number(x.count),0),authFailures:dispatchIncidents.filter(x=>x.kind==='auth').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='auth_uncertainty').reduce((n,x)=>n+Number(x.count),0),duplicateIncidents:incidents.filter(x=>x.label==='cannibalization').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='duplicate_risk').reduce((n,x)=>n+Number(x.count),0),unacceptableOutcomes:incidents.filter(x=>x.label!=='policy_block').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='unacceptable_outcome').reduce((n,x)=>n+Number(x.count),0)};
  return {...counts,modelKey:modelPin?.modelKey??null,selectorVersion:modelPin?.selectorVersion??null,evidenceHash:sha256({scope:{accountId:input.accountId,action:input.action,category:input.category,riskTier:input.riskTier},modelPin,approvals:approvals.map(x=>x.id).sort((a,b)=>a-b),incidents,dispatchIncidents,audit})};
}
export async function createAutonomySuggestion(input:AutonomyEvidence):Promise<string> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();await validateAutonomyScope(input);
  const evidence=await getAutonomyEvidence(input);
  if(input.riskTier!=="low"||!evidence.modelKey||!evidence.selectorVersion||evidence.cleanApprovals<30||evidence.policyFailures||evidence.authFailures||evidence.duplicateIncidents||evidence.unacceptableOutcomes)throw new Error("autonomy suggestion requires at least 30 matched clean low-risk approvals and zero incidents");
  const {modelKey,selectorVersion}=evidence;
  const id=randomUUID();
  await tx(async()=>{
    await exec(`INSERT INTO autonomy_suggestions(id,owner_user_id,account_id,action,category,risk_tier,clean_approvals,policy_failures,auth_failures,duplicate_incidents,unacceptable_outcomes,evidence_hash,status,created_at,decided_at,model_key,selector_version) VALUES (${quote(id)},${quote(owner)},${quote(input.accountId)},${quote(input.action)},${quote(input.category)},${quote(input.riskTier)},${evidence.cleanApprovals},${evidence.policyFailures},${evidence.authFailures},${evidence.duplicateIncidents},${evidence.unacceptableOutcomes},${quote(evidence.evidenceHash)},'suggested',${num(input.createdAt)},NULL,${quote(modelKey)},${quote(selectorVersion)});`);
    await exec(`INSERT INTO autonomy_audit(owner_user_id,account_id,action,category,risk_tier,event,reason,evidence_hash,created_at) VALUES (${quote(owner)},${quote(input.accountId)},${quote(input.action)},${quote(input.category)},${quote(input.riskTier)},'suggested','eligible_clean_history',${quote(evidence.evidenceHash)},${num(input.createdAt)});`);
  });
  return id;
}
export async function confirmAutonomySuggestion(id:string,now:number,expectedEvidenceHash?:string,expectedAccountId?:string):Promise<AutonomyScope & AutonomyModelPin> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();
  return tx(async()=>{
    const row=(await rows<Record<string,unknown>>(`SELECT * FROM autonomy_suggestions WHERE id=${quote(id)} AND owner_user_id=${quote(owner)} AND status='suggested' FOR UPDATE;`))[0];
    if(!row)throw new Error("pending autonomy suggestion not found for owner");
    if(expectedAccountId!==undefined&&String(row.account_id)!==expectedAccountId)throw new Error("pending autonomy proposal not found for owner account");
    if(expectedEvidenceHash!==undefined&&String(row.evidence_hash)!==expectedEvidenceHash)throw new Error("autonomy proposal evidence hash mismatch");
    if(typeof row.model_key!=="string"||!row.model_key||typeof row.selector_version!=="string"||!row.selector_version)throw new Error("autonomy proposal has no persisted model pin");
    const scope={accountId:String(row.account_id),action:String(row.action),category:String(row.category),riskTier:String(row.risk_tier)};await validateAutonomyScope(scope);
    if(!["post","repost","reply"].includes(scope.action)||scope.riskTier!=="low")throw new Error("autonomy proposal scope is not eligible");
    const account=(await rows<{enabled:number}>(`SELECT enabled FROM accounts WHERE id=${quote(scope.accountId)} AND owner_user_id=${quote(owner)} FOR UPDATE;`))[0];
    if(!account||Number(account.enabled)!==1)throw new Error("autonomy account is no longer enabled");
    const category=(await rows<{account_id:string}>(`SELECT mapping.account_id FROM ispatla_app.account_categories mapping
      JOIN ispatla_app.categories category ON category.id=mapping.category_id
      WHERE mapping.account_id=${quote(scope.accountId)} AND mapping.enabled=1 AND category.enabled=1 AND category.slug=${quote(scope.category)}
        AND (category.owner_user_id IS NULL OR category.owner_user_id=${quote(owner)})
        AND (category.account_id IS NULL OR category.account_id=${quote(scope.accountId)})
      FOR UPDATE OF mapping, category;`))[0];
    if(!category)throw new Error("autonomy category is no longer enabled for this account");
    const modelPin={modelKey:String(row.model_key),selectorVersion:String(row.selector_version)};
    const activePin=await currentAutonomyModelPin(scope);
    if(!activePin||activePin.modelKey!==modelPin.modelKey||activePin.selectorVersion!==modelPin.selectorVersion)throw new Error("autonomy model pin changed; a new suggestion is required");
    const current=await getAutonomyEvidence(scope,modelPin);
    if(current.evidenceHash!==String(row.evidence_hash)||current.cleanApprovals<30||current.policyFailures||current.authFailures||current.duplicateIncidents||current.unacceptableOutcomes)throw new Error("autonomy evidence changed; a new suggestion is required");
    await exec(`UPDATE autonomy_suggestions SET status='accepted',decided_at=${num(now)} WHERE id=${quote(id)} AND owner_user_id=${quote(owner)} AND status='suggested';`);
    await exec(`INSERT INTO scoped_autonomy(owner_user_id,account_id,action,category,risk_tier,suggestion_id,enabled_at,disabled_at,model_key,selector_version) VALUES (${quote(owner)},${quote(scope.accountId)},${quote(scope.action)},${quote(scope.category)},${quote(scope.riskTier)},${quote(id)},${num(now)},NULL,${quote(modelPin.modelKey)},${quote(modelPin.selectorVersion)}) ON CONFLICT(owner_user_id,account_id,action,category,risk_tier) DO UPDATE SET suggestion_id=excluded.suggestion_id,enabled_at=excluded.enabled_at,disabled_at=NULL,model_key=excluded.model_key,selector_version=excluded.selector_version;`);
    await exec(`INSERT INTO autonomy_audit(owner_user_id,account_id,action,category,risk_tier,event,reason,evidence_hash,created_at) VALUES (${quote(owner)},${quote(scope.accountId)},${quote(scope.action)},${quote(scope.category)},${quote(scope.riskTier)},'confirmed','explicit_user_confirmation',${quote(String(row.evidence_hash))},${num(now)});`);
    return {...scope,...modelPin};
  }, "serializable");
}
export async function demoteScopedAutonomy(input:AutonomyScope & {reason:"policy_failure"|"auth_uncertainty"|"duplicate_risk"|"unacceptable_outcome"|"user_requested";now:number}):Promise<boolean> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();await validateAutonomyScope(input);
  return tx(async()=>{
    const row=(await rows<Record<string,unknown>>(`SELECT suggestion_id FROM scoped_autonomy WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)} AND risk_tier=${quote(input.riskTier)} AND disabled_at IS NULL FOR UPDATE;`))[0];
    if(!row)return false;
    await exec(`UPDATE scoped_autonomy SET disabled_at=${num(input.now)} WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)} AND risk_tier=${quote(input.riskTier)} AND disabled_at IS NULL;`);
    await exec(`UPDATE autonomy_suggestions SET status='demoted',decided_at=${num(input.now)} WHERE id=${quote(String(row.suggestion_id))} AND owner_user_id=${quote(owner)} AND status='accepted';`);
    const evidence=(await rows<{evidence_hash:string}>(`SELECT evidence_hash FROM autonomy_suggestions WHERE id=${quote(String(row.suggestion_id))} AND owner_user_id=${quote(owner)};`))[0]?.evidence_hash??"";
    await exec(`INSERT INTO autonomy_audit(owner_user_id,account_id,action,category,risk_tier,event,reason,evidence_hash,created_at) VALUES (${quote(owner)},${quote(input.accountId)},${quote(input.action)},${quote(input.category)},${quote(input.riskTier)},'demoted',${quote(input.reason)},${quote(evidence)},${num(input.now)});`);
    return true;
  });
}
export async function isScopedAutonomyEnabled(scope:AutonomyScope):Promise<boolean> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();await validateAutonomyScope(scope);
  const row=(await rows<{model_key:string;selector_version:string}>(`SELECT a.model_key,a.selector_version FROM scoped_autonomy a JOIN autonomy_suggestions s ON s.id=a.suggestion_id AND s.owner_user_id=a.owner_user_id WHERE a.owner_user_id=${quote(owner)} AND a.account_id=${quote(scope.accountId)} AND a.action=${quote(scope.action)} AND a.category=${quote(scope.category)} AND a.risk_tier=${quote(scope.riskTier)} AND a.disabled_at IS NULL AND a.model_key IS NOT NULL AND a.selector_version IS NOT NULL AND s.status='accepted' AND s.model_key=a.model_key AND s.selector_version=a.selector_version LIMIT 1;`))[0];
  if(!row)return false;
  const active=await currentAutonomyModelPin(scope);
  return active?.modelKey===row.model_key&&active.selectorVersion===row.selector_version;
}
export async function confirmedAutonomyAuthorization(scope:AutonomyScope):Promise<(AutonomyModelPin & {evidenceHash:string})|null> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();await validateAutonomyScope(scope);
  const row=(await rows<{evidence_hash:string;model_key:string;selector_version:string}>(`SELECT s.evidence_hash,s.model_key,s.selector_version FROM scoped_autonomy a JOIN autonomy_suggestions s ON s.id=a.suggestion_id AND s.owner_user_id=a.owner_user_id WHERE a.owner_user_id=${quote(owner)} AND a.account_id=${quote(scope.accountId)} AND a.action=${quote(scope.action)} AND a.category=${quote(scope.category)} AND a.risk_tier=${quote(scope.riskTier)} AND a.disabled_at IS NULL AND s.status='accepted' AND a.model_key IS NOT NULL AND a.selector_version IS NOT NULL AND a.model_key=s.model_key AND a.selector_version=s.selector_version LIMIT 1;`))[0];
  return row?{evidenceHash:String(row.evidence_hash),modelKey:String(row.model_key),selectorVersion:String(row.selector_version)}:null;
}
export async function confirmedAutonomyEvidenceHash(scope:AutonomyScope):Promise<string|null> { return (await confirmedAutonomyAuthorization(scope))?.evidenceHash??null; }
export async function listAutonomyAudit():Promise<Array<{accountId:string;action:string;category:string;riskTier:string;event:string;reason:string;evidenceHash:string;createdAt:number}>> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();
  return (await rows<Record<string,unknown>>(`SELECT account_id,action,category,risk_tier,event,reason,evidence_hash,created_at FROM autonomy_audit WHERE owner_user_id=${quote(owner)} ORDER BY id;`)).map(row=>({accountId:String(row.account_id),action:String(row.action),category:String(row.category),riskTier:String(row.risk_tier),event:String(row.event),reason:String(row.reason),evidenceHash:String(row.evidence_hash),createdAt:Number(row.created_at)}));
}
