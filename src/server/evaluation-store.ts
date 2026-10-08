import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { currentOwnerId } from "@/server/owner-context";
import { ensureDatabase, getAccounts } from "@/server/db";

type Statement = { all(): unknown[] };
type NativeDatabase = { exec(sql: string): void; prepare(sql: string): Statement };
type NativeDatabaseCtor = new (path: string) => NativeDatabase;
const builtin = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule;
const DatabaseCtor: NativeDatabaseCtor = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
  ? (builtin("bun:sqlite") as { Database: NativeDatabaseCtor }).Database
  : (builtin("node:sqlite") as { DatabaseSync: NativeDatabaseCtor }).DatabaseSync;
const DB_PATH = process.env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3");
let database: NativeDatabase | undefined;
let ready = false;

function quote(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function num(value: number): string { if (!Number.isFinite(value)) throw new Error("numeric values must be finite"); return String(value); }
function obj(value: unknown): string { return quote(JSON.stringify(value)); }
function rows<T>(sql: string): T[] { if (!database) throw new Error("evaluation store is not initialized"); return database.prepare(sql).all() as T[]; }
function exec(sql: string): void { if (!database) throw new Error("evaluation store is not initialized"); database.exec(sql); }
function tx<T>(fn: () => T): T { exec("BEGIN IMMEDIATE"); try { const result = fn(); exec("COMMIT"); return result; } catch (error) { exec("ROLLBACK"); throw error; } }
export function requireEvaluationOwner(): string {
  const owner = currentOwnerId();
  if (!owner) throw new Error("evaluation data requires a verified owner context");
  return owner;
}
export function ensureEvaluationStore(): true {
  if (ready) return true;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseCtor(DB_PATH);
  exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  exec(`CREATE TABLE IF NOT EXISTS evaluation_predictions (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, account_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
    leakage_group TEXT NOT NULL, model_key TEXT NOT NULL, raw_score REAL NOT NULL, split TEXT NOT NULL CHECK(split IN ('train','calibration','holdout')),
    selector_version TEXT NOT NULL, selection_propensity REAL, action TEXT NOT NULL, category TEXT NOT NULL, format TEXT NOT NULL,
    risk_tier TEXT NOT NULL, features_json TEXT NOT NULL, created_at INTEGER NOT NULL, resolve_by INTEGER NOT NULL,
    UNIQUE(owner_user_id,account_id,candidate_id,model_key)
  );
  CREATE TABLE IF NOT EXISTS evaluation_outcome_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_user_id TEXT NOT NULL, prediction_id TEXT NOT NULL REFERENCES evaluation_predictions(id),
    captured_at INTEGER NOT NULL, observed_at INTEGER NOT NULL, views REAL, likes REAL, replies REAL, reposts REAL, quotes REAL,
    censored_json TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('official_x_api','human_review')), provenance_ref TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS evaluation_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_user_id TEXT NOT NULL, prediction_id TEXT NOT NULL REFERENCES evaluation_predictions(id),
    label TEXT NOT NULL CHECK(label IN ('hit','miss','late_hit','wrong_account','wrong_format','policy_block','publisher_failure','cannibalization')),
    reviewer_ref TEXT NOT NULL, labeled_at INTEGER NOT NULL, UNIQUE(owner_user_id,prediction_id)
  );
  CREATE TABLE IF NOT EXISTS evaluation_replays (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, account_id TEXT NOT NULL, model_key TEXT NOT NULL,
    dataset_hash TEXT NOT NULL, split TEXT NOT NULL CHECK(split='holdout'), sample_count INTEGER NOT NULL,
    brier REAL, log_loss REAL, ece REAL, reliability_json TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS autonomy_suggestions (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, account_id TEXT NOT NULL, action TEXT NOT NULL, category TEXT NOT NULL,
    risk_tier TEXT NOT NULL, clean_approvals INTEGER NOT NULL, policy_failures INTEGER NOT NULL, auth_failures INTEGER NOT NULL,
    duplicate_incidents INTEGER NOT NULL, unacceptable_outcomes INTEGER NOT NULL, evidence_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('suggested','accepted','declined','demoted')), created_at INTEGER NOT NULL, decided_at INTEGER,
    model_key TEXT, selector_version TEXT
  );
  CREATE TABLE IF NOT EXISTS scoped_autonomy (
    owner_user_id TEXT NOT NULL, account_id TEXT NOT NULL, action TEXT NOT NULL, category TEXT NOT NULL, risk_tier TEXT NOT NULL,
    suggestion_id TEXT NOT NULL, enabled_at INTEGER NOT NULL, disabled_at INTEGER, model_key TEXT, selector_version TEXT,
    PRIMARY KEY(owner_user_id,account_id,action,category,risk_tier)
  );
  CREATE TABLE IF NOT EXISTS autonomy_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_user_id TEXT NOT NULL, account_id TEXT NOT NULL, action TEXT NOT NULL,
    category TEXT NOT NULL, risk_tier TEXT NOT NULL, event TEXT NOT NULL CHECK(event IN ('suggested','confirmed','declined','demoted')),
    reason TEXT NOT NULL, evidence_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS evaluation_due_idx ON evaluation_predictions(owner_user_id,resolve_by,split);
  CREATE INDEX IF NOT EXISTS evaluation_group_idx ON evaluation_predictions(owner_user_id,leakage_group);
  CREATE INDEX IF NOT EXISTS evaluation_outcome_idx ON evaluation_outcome_revisions(owner_user_id,prediction_id,captured_at);
  CREATE INDEX IF NOT EXISTS evaluation_replay_idx ON evaluation_replays(owner_user_id,account_id,created_at);`);
  for (const [table,column] of [["autonomy_suggestions","model_key"],["autonomy_suggestions","selector_version"],["scoped_autonomy","model_key"],["scoped_autonomy","selector_version"]] as const) {
    if (!rows<{name:string}>(`PRAGMA table_info(${table});`).some(row=>row.name===column)) exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT;`);
  }
  ready = true;
  return true;
}

/** Accounts are resolved under the authenticated owner context before evaluation data is accepted. */
export function requireEvaluationAccount(accountId: string): void {
  ensureDatabase();
  const owner = requireEvaluationOwner();
  if (!/^\d+$/.test(accountId) || !getAccounts().some(account => String(account.id) === accountId && account.ownerUserId === owner)) {
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
export function recordEvaluationPrediction(input: EvaluationPredictionInput): EvaluationPrediction {
  ensureEvaluationStore(); const owner = requireEvaluationOwner();
  requireEvaluationAccount(input.accountId);
  for (const value of [input.accountId,input.candidateId,input.leakageGroup,input.modelKey,input.selectorVersion,input.action,input.category,input.format,input.riskTier]) if (!value.trim()) throw new Error("prediction provenance and scope fields are required");
  if (input.resolveBy < input.createdAt) throw new Error("resolve-by must not precede prediction time");
  if (input.selectionPropensity != null && (!Number.isFinite(input.selectionPropensity) || input.selectionPropensity <= 0 || input.selectionPropensity > 1)) throw new Error("selection propensity must be in (0,1]");
  return tx(() => {
  const id = randomUUID(), split = splitLeakageGroup(input.leakageGroup);
  const existing = rows<Record<string, unknown>>(`SELECT * FROM evaluation_predictions WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND candidate_id=${quote(input.candidateId)} AND model_key=${quote(input.modelKey)};`)[0];
  if (existing) {
    if (existing.leakage_group !== input.leakageGroup || existing.split !== split) throw new Error("candidate already exists with conflicting leakage group");
    return mapPrediction(existing);
  }
  exec(`INSERT INTO evaluation_predictions VALUES (${quote(id)},${quote(owner)},${quote(input.accountId)},${quote(input.candidateId)},${quote(input.leakageGroup)},${quote(input.modelKey)},${num(input.rawScore)},${quote(split)},${quote(input.selectorVersion)},${input.selectionPropensity == null ? "NULL" : num(input.selectionPropensity)},${quote(input.action)},${quote(input.category)},${quote(input.format)},${quote(input.riskTier)},${obj(input.features)},${num(input.createdAt)},${num(input.resolveBy)});`);
  return getEvaluationPrediction(id)!;
  });
}
function mapPrediction(row: Record<string, unknown>): EvaluationPrediction {
  return { id:String(row.id),ownerUserId:String(row.owner_user_id),accountId:String(row.account_id),candidateId:String(row.candidate_id),leakageGroup:String(row.leakage_group),modelKey:String(row.model_key),rawScore:Number(row.raw_score),split:row.split as EvaluationSplit,selectorVersion:String(row.selector_version),selectionPropensity:row.selection_propensity==null?null:Number(row.selection_propensity),action:String(row.action),category:String(row.category),format:String(row.format),riskTier:String(row.risk_tier),features:JSON.parse(String(row.features_json)),createdAt:Number(row.created_at),resolveBy:Number(row.resolve_by) };
}
export function getEvaluationPrediction(id: string): EvaluationPrediction | null { ensureEvaluationStore(); const owner=requireEvaluationOwner(); const row=rows<Record<string,unknown>>(`SELECT * FROM evaluation_predictions WHERE id=${quote(id)} AND owner_user_id=${quote(owner)};`)[0]; return row?mapPrediction(row):null; }
export function listEvaluationPredictions(accountId?:string,modelKey?:string,limit=100):EvaluationPrediction[] {
  ensureEvaluationStore();const owner=requireEvaluationOwner();if(accountId!==undefined)requireEvaluationAccount(accountId);if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("limit must be between 1 and 500");
  const where=[`owner_user_id=${quote(owner)}`];if(accountId!==undefined)where.push(`account_id=${quote(accountId)}`);if(modelKey!==undefined)where.push(`model_key=${quote(modelKey)}`);
  return rows<Record<string,unknown>>(`SELECT * FROM evaluation_predictions WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ${limit};`).map(mapPrediction);
}
/** Returns all persisted classifications for a candidate so execution can fail closed on disagreement. */
export function listSourceCandidateEvaluationPredictions(accountId:string,sourceCandidateId:string):EvaluationPrediction[] {
  ensureEvaluationStore();requireEvaluationAccount(accountId);const owner=requireEvaluationOwner();
  return rows<Record<string,unknown>>(`SELECT * FROM evaluation_predictions WHERE owner_user_id=${quote(owner)} AND account_id=${quote(accountId)} AND json_extract(features_json,'$.sourceCandidateId')=${quote(sourceCandidateId)} ORDER BY id;`).map(mapPrediction);
}
export function listDueUnresolvedPredictions(now: number, limit = 100, filter:{accountId?:string;modelKey?:string}={}): EvaluationPrediction[] {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); if (!Number.isInteger(limit)||limit<1||limit>500) throw new Error("limit must be between 1 and 500");
  if(filter.accountId!==undefined)requireEvaluationAccount(filter.accountId);
  const where=[`p.owner_user_id=${quote(owner)}`,`p.resolve_by<=${num(now)}`,`NOT EXISTS(SELECT 1 FROM evaluation_labels l WHERE l.owner_user_id=p.owner_user_id AND l.prediction_id=p.id)`];
  if(filter.accountId!==undefined)where.push(`p.account_id=${quote(filter.accountId)}`);if(filter.modelKey!==undefined)where.push(`p.model_key=${quote(filter.modelKey)}`);
  return rows<Record<string,unknown>>(`SELECT p.* FROM evaluation_predictions p WHERE ${where.join(" AND ")} ORDER BY p.resolve_by,p.id LIMIT ${limit};`).map(mapPrediction);
}

export type DuePublicationOutcome = { prediction: EvaluationPrediction; accountId: number; remoteReceipt: string; remoteUrl: string };
/** Owner-scoped confirmed publications ready for official metric capture. Filter before LIMIT so old rejected/unmatched predictions cannot starve eligible rows. */
export function listDuePublicationOutcomes(now: number, limit = 100): DuePublicationOutcome[] {
  ensureEvaluationStore(); const owner = requireEvaluationOwner();
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("limit must be between 1 and 500");
  const matches = rows<Record<string, unknown>>(`SELECT p.*, i.account_id AS intent_account_id, i.receipt AS remote_receipt, i.remote_url AS remote_url
    FROM evaluation_predictions p
    JOIN drafts d ON d.owner_user_id=p.owner_user_id
    JOIN publication_intents i ON i.draft_id=d.id AND i.account_id=CAST(p.account_id AS INTEGER)
      AND i.status='confirmed' AND i.confirmed_at IS NOT NULL AND i.confirmed_at+1209600<=${num(now)}
      AND p.created_at<=i.requested_at
    JOIN publication_approval_snapshots s ON s.id=i.approval_snapshot_id AND s.entity_type='publication_intent'
      AND s.entity_id=i.id AND s.draft_id=d.id AND s.account_id=i.account_id
      AND s.external_id=json_extract(p.features_json,'$.sourceCandidateId')
      AND s.text=i.text AND s.action='post' AND s.approved_at>=p.created_at AND s.expires_at>=COALESCE(i.dispatched_at,i.confirmed_at)
    JOIN accounts a ON a.id=i.account_id AND a.owner_user_id=p.owner_user_id
    WHERE p.owner_user_id=${quote(owner)} AND p.resolve_by<=${num(now)} AND json_extract(p.features_json,'$.decision')='eligible'
      AND NOT EXISTS(SELECT 1 FROM evaluation_labels l WHERE l.owner_user_id=p.owner_user_id AND l.prediction_id=p.id)
      AND NOT EXISTS(SELECT 1 FROM evaluation_outcome_revisions o WHERE o.owner_user_id=p.owner_user_id AND o.prediction_id=p.id)
      AND NOT EXISTS(SELECT 1 FROM evaluation_predictions newer WHERE newer.owner_user_id=p.owner_user_id
        AND newer.account_id=p.account_id AND json_extract(newer.features_json,'$.sourceCandidateId')=json_extract(p.features_json,'$.sourceCandidateId')
        AND json_extract(newer.features_json,'$.decision')='eligible' AND newer.created_at>p.created_at AND newer.created_at<=i.requested_at)
    ORDER BY i.confirmed_at,p.resolve_by,p.id LIMIT ${limit};`);
  return matches.map((row) => ({ prediction: mapPrediction(row), accountId: Number(row.intent_account_id), remoteReceipt: String(row.remote_receipt || ""), remoteUrl: String(row.remote_url || "") }));
}

export type XOutcomeInput = { predictionId: string; capturedAt: number; observedAt: number; metrics: { views:number|null;likes:number|null;replies:number|null;reposts:number|null;quotes:number|null }; censored?: string[]; source:"official_x_api"|"human_review"; provenanceRef:string };
export function appendObservedOutcome(input: XOutcomeInput): number {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); const prediction=getEvaluationPrediction(input.predictionId);
  if (!prediction) throw new Error("prediction not found for owner");
  if (!input.provenanceRef.trim() || !Number.isFinite(input.capturedAt) || !Number.isFinite(input.observedAt)) throw new Error("outcome timestamp and provenance are required");
  const allowed=new Set(["views","likes","replies","reposts","quotes"]); if ((input.censored||[]).some(x=>!allowed.has(x))) throw new Error("unknown censored metric");
  for(const [key,value] of Object.entries(input.metrics)) if(value!==null&&(!Number.isFinite(value)||value<0)) throw new Error(`invalid ${key} outcome`);
  if(input.observedAt<prediction.createdAt || input.capturedAt<input.observedAt) throw new Error("outcome chronology is invalid");
  return tx(() => {
  const previous=rows<{captured_at:number;observed_at:number}>(`SELECT captured_at,observed_at FROM evaluation_outcome_revisions WHERE owner_user_id=${quote(owner)} AND prediction_id=${quote(input.predictionId)} ORDER BY captured_at DESC,id DESC LIMIT 1;`)[0];
  if(previous&&(input.capturedAt<=previous.captured_at||input.observedAt<previous.observed_at)) throw new Error("outcome revisions must append in observed and captured time order");
  exec(`INSERT INTO evaluation_outcome_revisions(owner_user_id,prediction_id,captured_at,observed_at,views,likes,replies,reposts,quotes,censored_json,source,provenance_ref) VALUES (${quote(owner)},${quote(input.predictionId)},${num(input.capturedAt)},${num(input.observedAt)},${input.metrics.views===null?"NULL":num(input.metrics.views)},${input.metrics.likes===null?"NULL":num(input.metrics.likes)},${input.metrics.replies===null?"NULL":num(input.metrics.replies)},${input.metrics.reposts===null?"NULL":num(input.metrics.reposts)},${input.metrics.quotes===null?"NULL":num(input.metrics.quotes)},${obj(input.censored||[])},${quote(input.source)},${quote(input.provenanceRef)});`);
  return Number(rows<{id:number}>("SELECT last_insert_rowid() AS id;")[0].id);
  });
}
export function listEvaluationOutcomes(predictionId:string):Array<{capturedAt:number;observedAt:number;metrics:{views:number|null;likes:number|null;replies:number|null;reposts:number|null;quotes:number|null};censored:string[];source:string;provenanceRef:string}> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();if(!getEvaluationPrediction(predictionId))throw new Error("prediction not found for owner");
  return rows<Record<string,unknown>>(`SELECT * FROM evaluation_outcome_revisions WHERE owner_user_id=${quote(owner)} AND prediction_id=${quote(predictionId)} ORDER BY captured_at,id;`).map(row=>({capturedAt:Number(row.captured_at),observedAt:Number(row.observed_at),metrics:{views:row.views==null?null:Number(row.views),likes:row.likes==null?null:Number(row.likes),replies:row.replies==null?null:Number(row.replies),reposts:row.reposts==null?null:Number(row.reposts),quotes:row.quotes==null?null:Number(row.quotes)},censored:JSON.parse(String(row.censored_json)),source:String(row.source),provenanceRef:String(row.provenance_ref)}));
}
export type OutcomeLabel = "hit"|"miss"|"late_hit"|"wrong_account"|"wrong_format"|"policy_block"|"publisher_failure"|"cannibalization";
export function adjudicateEvaluationPrediction(input:{predictionId:string;label:OutcomeLabel;reviewerRef:string;labeledAt:number}): void {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); if(!getEvaluationPrediction(input.predictionId)) throw new Error("prediction not found for owner");
  if(!input.reviewerRef.trim()||!Number.isFinite(input.labeledAt)) throw new Error("human label provenance required");
  exec(`INSERT INTO evaluation_labels(owner_user_id,prediction_id,label,reviewer_ref,labeled_at) VALUES (${quote(owner)},${quote(input.predictionId)},${quote(input.label)},${quote(input.reviewerRef)},${num(input.labeledAt)});`);
}
export function listEvaluationLabels(split?: EvaluationSplit, modelKey?: string, accountId?:string): Array<{prediction:EvaluationPrediction;label:OutcomeLabel}> {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); if(accountId)requireEvaluationAccount(accountId); const where=[`p.owner_user_id=${quote(owner)}`]; if(split)where.push(`p.split=${quote(split)}`); if(modelKey)where.push(`p.model_key=${quote(modelKey)}`); if(accountId)where.push(`p.account_id=${quote(accountId)}`);
  return rows<Record<string,unknown>>(`SELECT p.*,l.label FROM evaluation_predictions p JOIN evaluation_labels l ON l.prediction_id=p.id AND l.owner_user_id=p.owner_user_id WHERE ${where.join(" AND ")} ORDER BY p.created_at,p.id;`).map(row=>({prediction:mapPrediction(row),label:row.label as OutcomeLabel}));
}
export function saveEvaluationReplay(input:{accountId:string;modelKey:string;datasetHash:string;sampleCount:number;brier:number|null;logLoss:number|null;ece:number|null;reliability:unknown;createdAt:number}): string {
  ensureEvaluationStore(); const owner=requireEvaluationOwner(); requireEvaluationAccount(input.accountId); const id=randomUUID();
  if(!input.accountId.trim()||!input.modelKey.trim()||!input.datasetHash.trim()||!Number.isInteger(input.sampleCount)||input.sampleCount<0) throw new Error("replay provenance is required");
  exec(`INSERT INTO evaluation_replays VALUES (${quote(id)},${quote(owner)},${quote(input.accountId)},${quote(input.modelKey)},${quote(input.datasetHash)},'holdout',${num(input.sampleCount)},${input.brier==null?"NULL":num(input.brier)},${input.logLoss==null?"NULL":num(input.logLoss)},${input.ece==null?"NULL":num(input.ece)},${obj(input.reliability)},${num(input.createdAt)});`);
  return id;
}
export type EvaluationReplay={id:string;accountId:string;modelKey:string;datasetHash:string;split:"holdout";sampleCount:number;brier:number|null;logLoss:number|null;ece:number|null;reliability:unknown;createdAt:number};
export function listEvaluationReplays(accountId?:string,modelKey?:string,limit=100):EvaluationReplay[] {
  ensureEvaluationStore();const owner=requireEvaluationOwner();if(accountId!==undefined)requireEvaluationAccount(accountId);if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("limit must be between 1 and 500");
  const where=[`owner_user_id=${quote(owner)}`];if(accountId!==undefined)where.push(`account_id=${quote(accountId)}`);if(modelKey!==undefined)where.push(`model_key=${quote(modelKey)}`);
  return rows<Record<string,unknown>>(`SELECT * FROM evaluation_replays WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ${limit};`).map(row=>({id:String(row.id),accountId:String(row.account_id),modelKey:String(row.model_key),datasetHash:String(row.dataset_hash),split:"holdout",sampleCount:Number(row.sample_count),brier:row.brier==null?null:Number(row.brier),logLoss:row.log_loss==null?null:Number(row.log_loss),ece:row.ece==null?null:Number(row.ece),reliability:JSON.parse(String(row.reliability_json)),createdAt:Number(row.created_at)}));
}
export function saveCalibrationProfile(input:{modelKey:string;mapping:Array<{upperScore:number;probability:number;count:number}>;sampleCount:number;calibrationGroupHash:string;createdAt:number;status:"calibrated"|"insufficient"}): void {
  ensureEvaluationStore(); const owner=requireEvaluationOwner();
  const table="evaluation_calibration_profiles";
  exec(`CREATE TABLE IF NOT EXISTS ${table}(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id TEXT NOT NULL,model_key TEXT NOT NULL,mapping_json TEXT NOT NULL,sample_count INTEGER NOT NULL,group_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('calibrated','insufficient')),created_at INTEGER NOT NULL);`);
  exec(`INSERT INTO ${table}(owner_user_id,model_key,mapping_json,sample_count,group_hash,status,created_at) VALUES (${quote(owner)},${quote(input.modelKey)},${obj(input.mapping)},${num(input.sampleCount)},${quote(input.calibrationGroupHash)},${quote(input.status)},${num(input.createdAt)});`);
}
export function latestCalibrationProfile(modelKey:string): {mapping:Array<{upperScore:number;probability:number;count:number}>;sampleCount:number;groupHash:string;status:"calibrated"|"insufficient"}|null {
  ensureEvaluationStore();const owner=requireEvaluationOwner();
  exec("CREATE TABLE IF NOT EXISTS evaluation_calibration_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id TEXT NOT NULL,model_key TEXT NOT NULL,mapping_json TEXT NOT NULL,sample_count INTEGER NOT NULL,group_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('calibrated','insufficient')),created_at INTEGER NOT NULL);");
  const row=rows<Record<string,unknown>>(`SELECT * FROM evaluation_calibration_profiles WHERE owner_user_id=${quote(owner)} AND model_key=${quote(modelKey)} ORDER BY id DESC LIMIT 1;`)[0];
  return row?{mapping:JSON.parse(String(row.mapping_json)),sampleCount:Number(row.sample_count),groupHash:String(row.group_hash),status:row.status as "calibrated"|"insufficient"}:null;
}
export function sha256(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export type AutonomyScope = { accountId:string; action:string; category:string; riskTier:string };
export type AutonomyModelPin = { modelKey:string; selectorVersion:string };
export type AutonomyEvidence = AutonomyScope & { createdAt:number };
function validateAutonomyScope(scope:AutonomyScope):void {
  requireEvaluationAccount(scope.accountId);
  if (![scope.action,scope.category,scope.riskTier].every(value=>value.trim())) throw new Error("autonomy scope is required");
}
function currentAutonomyModelPin(input:AutonomyScope):AutonomyModelPin|null {
  const owner=requireEvaluationOwner();
  const row=rows<{model_key:string;selector_version:string}>(`SELECT model_key,selector_version FROM evaluation_predictions
    WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)}
    ORDER BY created_at DESC,id DESC LIMIT 1;`)[0];
  return row?.model_key&&row.selector_version?{modelKey:String(row.model_key),selectorVersion:String(row.selector_version)}:null;
}
export function getAutonomyEvidence(input:AutonomyScope,pin?:AutonomyModelPin):{cleanApprovals:number;policyFailures:number;authFailures:number;duplicateIncidents:number;unacceptableOutcomes:number;evidenceHash:string;modelKey:string|null;selectorVersion:string|null} {
  ensureEvaluationStore();validateAutonomyScope(input);
  const owner=requireEvaluationOwner();
  const modelPin=pin??currentAutonomyModelPin(input);
  const modelFilter=modelPin?`AND p.model_key=${quote(modelPin.modelKey)} AND p.selector_version=${quote(modelPin.selectorVersion)}`:"AND 1=0";
  const approvals=rows<{id:number}>(`SELECT DISTINCT intent.id
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
  const incidents=rows<{label:string;count:number}>(`SELECT l.label,COUNT(*) count FROM evaluation_labels l JOIN evaluation_predictions p ON p.id=l.prediction_id AND p.owner_user_id=l.owner_user_id WHERE p.owner_user_id=${quote(owner)} AND p.account_id=${quote(input.accountId)} AND p.action=${quote(input.action)} AND p.category=${quote(input.category)} ${modelPin?`AND p.model_key=${quote(modelPin.modelKey)} AND p.selector_version=${quote(modelPin.selectorVersion)}`:"AND 1=0"} AND l.label IN ('policy_block','wrong_account','wrong_format','publisher_failure','cannibalization') GROUP BY l.label;`);
  const dispatchIncidents=rows<{kind:string;count:number}>(`SELECT CASE WHEN intent.status='blocked' OR event.error_class='policy_blocked' THEN 'policy' WHEN event.error_class='reauth' THEN 'auth' ELSE 'other' END kind,COUNT(*) count FROM publication_intents intent JOIN drafts d ON d.id=intent.draft_id JOIN evaluation_predictions p ON p.owner_user_id=d.owner_user_id AND p.account_id=CAST(intent.account_id AS TEXT) AND json_extract(p.features_json,'$.sourceCandidateId')=d.external_id JOIN publication_intent_events event ON event.intent_id=intent.id WHERE d.owner_user_id=${quote(owner)} AND intent.account_id=${num(Number(input.accountId))} AND p.action=${quote(input.action)} AND p.category=${quote(input.category)} ${modelPin?`AND p.model_key=${quote(modelPin.modelKey)} AND p.selector_version=${quote(modelPin.selectorVersion)}`:"AND 1=0"} AND (intent.status='blocked' OR event.error_class IN ('policy_blocked','reauth')) GROUP BY kind;`);
  const audit=rows<{reason:string;count:number}>(`SELECT reason,COUNT(*) count FROM autonomy_audit WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)} AND event='demoted' GROUP BY reason;`);
  const counts={cleanApprovals:approvals.length,policyFailures:incidents.filter(x=>x.label==='policy_block').reduce((n,x)=>n+Number(x.count),0)+dispatchIncidents.filter(x=>x.kind==='policy').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='policy_failure').reduce((n,x)=>n+Number(x.count),0),authFailures:dispatchIncidents.filter(x=>x.kind==='auth').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='auth_uncertainty').reduce((n,x)=>n+Number(x.count),0),duplicateIncidents:incidents.filter(x=>x.label==='cannibalization').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='duplicate_risk').reduce((n,x)=>n+Number(x.count),0),unacceptableOutcomes:incidents.filter(x=>x.label!=='policy_block').reduce((n,x)=>n+Number(x.count),0)+audit.filter(x=>x.reason==='unacceptable_outcome').reduce((n,x)=>n+Number(x.count),0)};
  return {...counts,modelKey:modelPin?.modelKey??null,selectorVersion:modelPin?.selectorVersion??null,evidenceHash:sha256({scope:{accountId:input.accountId,action:input.action,category:input.category,riskTier:input.riskTier},modelPin,approvals:approvals.map(x=>x.id).sort((a,b)=>a-b),incidents,dispatchIncidents,audit})};
}
export function createAutonomySuggestion(input:AutonomyEvidence):string {
  ensureEvaluationStore();const owner=requireEvaluationOwner();validateAutonomyScope(input);
  const evidence=getAutonomyEvidence(input);
  if(input.riskTier!=="low"||!evidence.modelKey||!evidence.selectorVersion||evidence.cleanApprovals<30||evidence.policyFailures||evidence.authFailures||evidence.duplicateIncidents||evidence.unacceptableOutcomes)throw new Error("autonomy suggestion requires at least 30 matched clean low-risk approvals and zero incidents");
  const {modelKey,selectorVersion}=evidence;
  const id=randomUUID();
  tx(()=>{
    exec(`INSERT INTO autonomy_suggestions(id,owner_user_id,account_id,action,category,risk_tier,clean_approvals,policy_failures,auth_failures,duplicate_incidents,unacceptable_outcomes,evidence_hash,status,created_at,decided_at,model_key,selector_version) VALUES (${quote(id)},${quote(owner)},${quote(input.accountId)},${quote(input.action)},${quote(input.category)},${quote(input.riskTier)},${evidence.cleanApprovals},${evidence.policyFailures},${evidence.authFailures},${evidence.duplicateIncidents},${evidence.unacceptableOutcomes},${quote(evidence.evidenceHash)},'suggested',${num(input.createdAt)},NULL,${quote(modelKey)},${quote(selectorVersion)});`);
    exec(`INSERT INTO autonomy_audit(owner_user_id,account_id,action,category,risk_tier,event,reason,evidence_hash,created_at) VALUES (${quote(owner)},${quote(input.accountId)},${quote(input.action)},${quote(input.category)},${quote(input.riskTier)},'suggested','eligible_clean_history',${quote(evidence.evidenceHash)},${num(input.createdAt)});`);
  });
  return id;
}
export function confirmAutonomySuggestion(id:string,now:number,expectedEvidenceHash?:string,expectedAccountId?:string):AutonomyScope & AutonomyModelPin {
  ensureEvaluationStore();const owner=requireEvaluationOwner();
  return tx(()=>{
    const row=rows<Record<string,unknown>>(`SELECT * FROM autonomy_suggestions WHERE id=${quote(id)} AND owner_user_id=${quote(owner)} AND status='suggested';`)[0];
    if(!row)throw new Error("pending autonomy suggestion not found for owner");
    if(expectedAccountId!==undefined&&String(row.account_id)!==expectedAccountId)throw new Error("pending autonomy proposal not found for owner account");
    if(expectedEvidenceHash!==undefined&&String(row.evidence_hash)!==expectedEvidenceHash)throw new Error("autonomy proposal evidence hash mismatch");
    if(typeof row.model_key!=="string"||!row.model_key||typeof row.selector_version!=="string"||!row.selector_version)throw new Error("autonomy proposal has no persisted model pin");
    const scope={accountId:String(row.account_id),action:String(row.action),category:String(row.category),riskTier:String(row.risk_tier)};validateAutonomyScope(scope);
    const modelPin={modelKey:String(row.model_key),selectorVersion:String(row.selector_version)};
    const activePin=currentAutonomyModelPin(scope);
    if(!activePin||activePin.modelKey!==modelPin.modelKey||activePin.selectorVersion!==modelPin.selectorVersion)throw new Error("autonomy model pin changed; a new suggestion is required");
    const current=getAutonomyEvidence(scope,modelPin);
    if(current.evidenceHash!==String(row.evidence_hash)||current.cleanApprovals<30||current.policyFailures||current.authFailures||current.duplicateIncidents||current.unacceptableOutcomes)throw new Error("autonomy evidence changed; a new suggestion is required");
    exec(`UPDATE autonomy_suggestions SET status='accepted',decided_at=${num(now)} WHERE id=${quote(id)} AND owner_user_id=${quote(owner)} AND status='suggested';`);
    exec(`INSERT INTO scoped_autonomy(owner_user_id,account_id,action,category,risk_tier,suggestion_id,enabled_at,disabled_at,model_key,selector_version) VALUES (${quote(owner)},${quote(scope.accountId)},${quote(scope.action)},${quote(scope.category)},${quote(scope.riskTier)},${quote(id)},${num(now)},NULL,${quote(modelPin.modelKey)},${quote(modelPin.selectorVersion)}) ON CONFLICT(owner_user_id,account_id,action,category,risk_tier) DO UPDATE SET suggestion_id=excluded.suggestion_id,enabled_at=excluded.enabled_at,disabled_at=NULL,model_key=excluded.model_key,selector_version=excluded.selector_version;`);
    exec(`INSERT INTO autonomy_audit(owner_user_id,account_id,action,category,risk_tier,event,reason,evidence_hash,created_at) VALUES (${quote(owner)},${quote(scope.accountId)},${quote(scope.action)},${quote(scope.category)},${quote(scope.riskTier)},'confirmed','explicit_user_confirmation',${quote(String(row.evidence_hash))},${num(now)});`);
    return {...scope,...modelPin};
  });
}
export function demoteScopedAutonomy(input:AutonomyScope & {reason:"policy_failure"|"auth_uncertainty"|"duplicate_risk"|"unacceptable_outcome"|"user_requested";now:number}):boolean {
  ensureEvaluationStore();const owner=requireEvaluationOwner();validateAutonomyScope(input);
  return tx(()=>{
    const row=rows<Record<string,unknown>>(`SELECT suggestion_id FROM scoped_autonomy WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)} AND risk_tier=${quote(input.riskTier)} AND disabled_at IS NULL;`)[0];
    if(!row)return false;
    exec(`UPDATE scoped_autonomy SET disabled_at=${num(input.now)} WHERE owner_user_id=${quote(owner)} AND account_id=${quote(input.accountId)} AND action=${quote(input.action)} AND category=${quote(input.category)} AND risk_tier=${quote(input.riskTier)} AND disabled_at IS NULL;`);
    exec(`UPDATE autonomy_suggestions SET status='demoted',decided_at=${num(input.now)} WHERE id=${quote(String(row.suggestion_id))} AND owner_user_id=${quote(owner)} AND status='accepted';`);
    const evidence=rows<{evidence_hash:string}>(`SELECT evidence_hash FROM autonomy_suggestions WHERE id=${quote(String(row.suggestion_id))} AND owner_user_id=${quote(owner)};`)[0]?.evidence_hash??"";
    exec(`INSERT INTO autonomy_audit(owner_user_id,account_id,action,category,risk_tier,event,reason,evidence_hash,created_at) VALUES (${quote(owner)},${quote(input.accountId)},${quote(input.action)},${quote(input.category)},${quote(input.riskTier)},'demoted',${quote(input.reason)},${quote(evidence)},${num(input.now)});`);
    return true;
  });
}
export function isScopedAutonomyEnabled(scope:AutonomyScope):boolean {
  ensureEvaluationStore();const owner=requireEvaluationOwner();validateAutonomyScope(scope);
  const row=rows<{model_key:string;selector_version:string}>(`SELECT a.model_key,a.selector_version FROM scoped_autonomy a JOIN autonomy_suggestions s ON s.id=a.suggestion_id AND s.owner_user_id=a.owner_user_id WHERE a.owner_user_id=${quote(owner)} AND a.account_id=${quote(scope.accountId)} AND a.action=${quote(scope.action)} AND a.category=${quote(scope.category)} AND a.risk_tier=${quote(scope.riskTier)} AND a.disabled_at IS NULL AND a.model_key IS NOT NULL AND a.selector_version IS NOT NULL AND s.status='accepted' AND s.model_key=a.model_key AND s.selector_version=a.selector_version LIMIT 1;`)[0];
  if(!row)return false;
  const active=currentAutonomyModelPin(scope);
  return active?.modelKey===row.model_key&&active.selectorVersion===row.selector_version;
}
export function confirmedAutonomyAuthorization(scope:AutonomyScope):(AutonomyModelPin & {evidenceHash:string})|null {
  ensureEvaluationStore();const owner=requireEvaluationOwner();validateAutonomyScope(scope);
  const row=rows<{evidence_hash:string;model_key:string;selector_version:string}>(`SELECT s.evidence_hash,s.model_key,s.selector_version FROM scoped_autonomy a JOIN autonomy_suggestions s ON s.id=a.suggestion_id AND s.owner_user_id=a.owner_user_id WHERE a.owner_user_id=${quote(owner)} AND a.account_id=${quote(scope.accountId)} AND a.action=${quote(scope.action)} AND a.category=${quote(scope.category)} AND a.risk_tier=${quote(scope.riskTier)} AND a.disabled_at IS NULL AND s.status='accepted' AND a.model_key IS NOT NULL AND a.selector_version IS NOT NULL AND a.model_key=s.model_key AND a.selector_version=s.selector_version LIMIT 1;`)[0];
  return row?{evidenceHash:String(row.evidence_hash),modelKey:String(row.model_key),selectorVersion:String(row.selector_version)}:null;
}
export function confirmedAutonomyEvidenceHash(scope:AutonomyScope):string|null { return confirmedAutonomyAuthorization(scope)?.evidenceHash??null; }
export function listAutonomyAudit():Array<{accountId:string;action:string;category:string;riskTier:string;event:string;reason:string;evidenceHash:string;createdAt:number}> {
  ensureEvaluationStore();const owner=requireEvaluationOwner();
  return rows<Record<string,unknown>>(`SELECT account_id,action,category,risk_tier,event,reason,evidence_hash,created_at FROM autonomy_audit WHERE owner_user_id=${quote(owner)} ORDER BY id;`).map(row=>({accountId:String(row.account_id),action:String(row.action),category:String(row.category),riskTier:String(row.risk_tier),event:String(row.event),reason:String(row.reason),evidenceHash:String(row.evidence_hash),createdAt:Number(row.created_at)}));
}
