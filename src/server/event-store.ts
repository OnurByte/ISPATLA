import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Match db.ts runtime selection so Node's built-in SQLite and Bun tests share a store.
type Statement = { all(): unknown[] };
type NativeDatabase = { exec(sql: string): void; prepare(sql: string): Statement };
type NativeDatabaseCtor = new (path: string) => NativeDatabase;
const builtin = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule;
const DatabaseCtor: NativeDatabaseCtor = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
  ? (builtin("bun:sqlite") as { Database: NativeDatabaseCtor }).Database
  : (builtin("node:sqlite") as { DatabaseSync: NativeDatabaseCtor }).DatabaseSync;
const DATABASE_PATH = process.env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3");
let database: NativeDatabase | undefined;
let initialized = false;

export type PublicMetricSnapshot = {
  likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; views: number | null;
  capturedAt: number; censored?: Array<"likes" | "replies" | "reposts" | "quotes" | "views">;
};
export type XObservationInput = {
  xPostId: string; authorId: string; authorHandle: string; observedAt: number; postCreatedAt: number;
  textSnapshot: string; metrics: PublicMetricSnapshot; referencedPosts?: Array<{ kind: "reply_to" | "repost_of" | "quote_of" | "conversation_root"; xPostId: string }>;
  urls?: string[]; media?: unknown[]; language?: string; readerProvider: string; rawHash: string;
};
export type XObservation = XObservationInput & { id: number; immutableConflict: boolean; metricRevision: number };
export type EventRecord = { id: number; title: string; category: string; stage: string; firstSeenAt: number; lastSeenAt: number; mergedInto: number | null };
export type ClaimRecord = { id: number; eventId: number; type: string; normalizedText: string; entities: string[]; firstSeenAt: number; confidenceClass: string; verificationMode: string };
export type EventAudit = { id: number; action: "merge" | "split"; sourceEventId: number; targetEventId: number | null; reason: string; details: Record<string, unknown>; createdAt: number };
export type SemanticThresholdProfile = { model: string; language: string; category: string; comparisonKind: string; version: string; threshold: number | null; sampleCount: number; positiveCount: number; negativeCount: number; balancedAccuracy: number | null; status: "calibrated" | "insufficient"; fixtureHash: string };

function q(value: string): string { return `'${String(value).replaceAll("'", "''")}'`; }
function n(value: number | null | undefined): string { return value === null || value === undefined || !Number.isFinite(value) ? "NULL" : String(value); }
function json(value: unknown): string { return q(JSON.stringify(value ?? null)); }
function rows<T>(sql: string): T[] { if (!database) throw new Error("event store not initialized"); return database.prepare(sql).all() as T[]; }
function exec(sql: string): void { if (!database) throw new Error("event store not initialized"); database.exec(sql); }
function tx<T>(callback: () => T): T { exec("BEGIN IMMEDIATE"); try { const value = callback(); exec("COMMIT"); return value; } catch (error) { exec("ROLLBACK"); throw error; } }

export function ensureEventStore(): boolean {
  if (initialized) return true;
  mkdirSync(dirname(DATABASE_PATH), { recursive: true });
  database = new DatabaseCtor(DATABASE_PATH);
  exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  exec(`CREATE TABLE IF NOT EXISTS intelligence_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, x_post_id TEXT NOT NULL UNIQUE, author_id TEXT NOT NULL, author_handle TEXT NOT NULL,
    observed_at INTEGER NOT NULL, post_created_at INTEGER NOT NULL, text_snapshot TEXT NOT NULL, referenced_posts_json TEXT NOT NULL,
    urls_json TEXT NOT NULL, media_json TEXT NOT NULL, language TEXT NOT NULL, reader_provider TEXT NOT NULL, raw_hash TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS intelligence_metric_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, observation_id INTEGER NOT NULL REFERENCES intelligence_observations(id), revision INTEGER NOT NULL,
    captured_at INTEGER NOT NULL, likes REAL, replies REAL, reposts REAL, quotes REAL, views REAL, censored_json TEXT NOT NULL,
    reader_provider TEXT NOT NULL, raw_hash TEXT NOT NULL, received_at INTEGER NOT NULL, UNIQUE(observation_id, revision)
  );
  CREATE TABLE IF NOT EXISTS intelligence_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'SEED',
    first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, merged_into INTEGER REFERENCES intelligence_events(id)
  );
  CREATE TABLE IF NOT EXISTS intelligence_candidate_events (
    candidate_key TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES intelligence_events(id),
    resolver TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS intelligence_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES intelligence_events(id), claim_type TEXT NOT NULL,
    normalized_text TEXT NOT NULL, entities_json TEXT NOT NULL, first_seen_at INTEGER NOT NULL, confidence_class TEXT NOT NULL,
    verification_mode TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS intelligence_event_observations (
    event_id INTEGER NOT NULL REFERENCES intelligence_events(id), observation_id INTEGER NOT NULL REFERENCES intelligence_observations(id),
    attached_at INTEGER NOT NULL, PRIMARY KEY(event_id, observation_id)
  );
  CREATE TABLE IF NOT EXISTS intelligence_claim_evidence (
    claim_id INTEGER NOT NULL REFERENCES intelligence_claims(id), observation_id INTEGER NOT NULL REFERENCES intelligence_observations(id),
    relation TEXT NOT NULL CHECK(relation IN ('supports','contradicts')), linked_at INTEGER NOT NULL, PRIMARY KEY(claim_id, observation_id, relation)
  );
  CREATE TABLE IF NOT EXISTS intelligence_lineage (
    observation_id INTEGER NOT NULL REFERENCES intelligence_observations(id), referenced_post_id TEXT NOT NULL, relation TEXT NOT NULL,
    PRIMARY KEY(observation_id, referenced_post_id, relation)
  );
  CREATE TABLE IF NOT EXISTS intelligence_event_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL CHECK(action IN ('merge','split')), source_event_id INTEGER NOT NULL,
    target_event_id INTEGER, reason TEXT NOT NULL, details_json TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS intelligence_threshold_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT NOT NULL, language TEXT NOT NULL, category TEXT NOT NULL,
    comparison_kind TEXT NOT NULL, version TEXT NOT NULL, threshold REAL, sample_count INTEGER NOT NULL,
    positive_count INTEGER NOT NULL, negative_count INTEGER NOT NULL, balanced_accuracy REAL,
    status TEXT NOT NULL CHECK(status IN ('calibrated','insufficient')), fixture_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS intelligence_observations_time_idx ON intelligence_observations(observed_at);
  CREATE INDEX IF NOT EXISTS intelligence_event_members_event_idx ON intelligence_event_observations(event_id, attached_at);
  CREATE INDEX IF NOT EXISTS intelligence_metric_revision_idx ON intelligence_metric_revisions(observation_id, revision);
  `);
  initialized = true;
  return true;
}

function mapObservation(row: Record<string, unknown>, metric: Record<string, unknown>, immutableConflict = false): XObservation {
  return {
    id: Number(row.id), xPostId: String(row.x_post_id), authorId: String(row.author_id), authorHandle: String(row.author_handle),
    observedAt: Number(row.observed_at), postCreatedAt: Number(row.post_created_at), textSnapshot: String(row.text_snapshot),
    referencedPosts: JSON.parse(String(row.referenced_posts_json)), urls: JSON.parse(String(row.urls_json)), media: JSON.parse(String(row.media_json)),
    language: String(row.language), readerProvider: String(row.reader_provider), rawHash: String(row.raw_hash), immutableConflict,
    metrics: { capturedAt: Number(metric.captured_at), likes: metric.likes === null ? null : Number(metric.likes), replies: metric.replies === null ? null : Number(metric.replies),
      reposts: metric.reposts === null ? null : Number(metric.reposts), quotes: metric.quotes === null ? null : Number(metric.quotes), views: metric.views === null ? null : Number(metric.views),
      censored: JSON.parse(String(metric.censored_json)) }, metricRevision: Number(metric.revision),
  };
}
export function upsertXObservation(input: XObservationInput): XObservation {
  ensureEventStore();
  if (!input.xPostId.trim() || !input.authorId.trim() || !input.readerProvider.trim() || !input.rawHash.trim()) throw new Error("𝕏 observation requires post, author, provider, and raw provenance");
  if (!Number.isFinite(input.observedAt) || !Number.isFinite(input.postCreatedAt) || !Number.isFinite(input.metrics.capturedAt)) throw new Error("observation timestamps must be finite");
  for (const key of ["likes", "replies", "reposts", "quotes", "views"] as const) { const value = input.metrics[key]; if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`invalid ${key} metric`); }
  return tx(() => {
    let row = rows<Record<string, unknown>>(`SELECT * FROM intelligence_observations WHERE x_post_id=${q(input.xPostId)};`)[0];
    const conflict = Boolean(row && (row.author_id !== input.authorId || row.post_created_at !== input.postCreatedAt || row.raw_hash !== input.rawHash || row.text_snapshot !== input.textSnapshot));
    if (!row) {
      exec(`INSERT INTO intelligence_observations (x_post_id,author_id,author_handle,observed_at,post_created_at,text_snapshot,referenced_posts_json,urls_json,media_json,language,reader_provider,raw_hash,first_seen_at)
        VALUES (${q(input.xPostId)},${q(input.authorId)},${q(input.authorHandle)},${n(input.observedAt)},${n(input.postCreatedAt)},${q(input.textSnapshot)},${json(input.referencedPosts)},${json(input.urls)},${json(input.media)},${q(input.language || "")},${q(input.readerProvider)},${q(input.rawHash)},${n(input.observedAt)});`);
      row = rows<Record<string, unknown>>(`SELECT * FROM intelligence_observations WHERE x_post_id=${q(input.xPostId)};`)[0];
      for (const reference of input.referencedPosts || []) exec(`INSERT OR IGNORE INTO intelligence_lineage VALUES (${n(Number(row.id))},${q(reference.xPostId)},${q(reference.kind)});`);
    }
    const observationId = Number(row!.id);
    const latest = rows<{ revision: number }>(`SELECT revision FROM intelligence_metric_revisions WHERE observation_id=${observationId} ORDER BY revision DESC LIMIT 1;`)[0];
    const revision = Number(latest?.revision || 0) + 1;
    exec(`INSERT INTO intelligence_metric_revisions (observation_id,revision,captured_at,likes,replies,reposts,quotes,views,censored_json,reader_provider,raw_hash,received_at)
      VALUES (${observationId},${revision},${n(input.metrics.capturedAt)},${n(input.metrics.likes)},${n(input.metrics.replies)},${n(input.metrics.reposts)},${n(input.metrics.quotes)},${n(input.metrics.views)},${json(input.metrics.censored)},${q(input.readerProvider)},${q(input.rawHash)},${n(input.observedAt)});`);
    const metric = rows<Record<string, unknown>>(`SELECT * FROM intelligence_metric_revisions WHERE observation_id=${observationId} AND revision=${revision};`)[0];
    return mapObservation(row!, metric!, conflict);
  });
}
export function getXObservation(id: number): XObservation | null {
  ensureEventStore();
  const row = rows<Record<string, unknown>>(`SELECT * FROM intelligence_observations WHERE id=${n(id)};`)[0];
  if (!row) return null;
  const metric = rows<Record<string, unknown>>(`SELECT * FROM intelligence_metric_revisions WHERE observation_id=${id} ORDER BY revision DESC LIMIT 1;`)[0];
  return metric ? mapObservation(row, metric) : null;
}
export function listXObservations(eventId?: number): XObservation[] {
  ensureEventStore();
  const ids = eventId === undefined ? rows<{ id: number }>("SELECT id FROM intelligence_observations ORDER BY observed_at,id;") : rows<{ observation_id: number }>(`SELECT observation_id FROM intelligence_event_observations WHERE event_id=${n(eventId)} ORDER BY attached_at,observation_id;`).map(row => ({ id: row.observation_id }));
  return ids.map(row => getXObservation(row.id)!).filter(Boolean);
}
export function createEvent(input: { title: string; category: string; firstSeenAt: number; lastSeenAt?: number; stage?: string }): EventRecord {
  ensureEventStore();
  if (!input.title.trim() || !input.category.trim()) throw new Error("event title and category are required");
  exec(`INSERT INTO intelligence_events(title,category,stage,first_seen_at,last_seen_at) VALUES (${q(input.title)},${q(input.category)},${q(input.stage || "SEED")},${n(input.firstSeenAt)},${n(input.lastSeenAt ?? input.firstSeenAt)});`);
  return getEvent(Number(rows<{ id: number }>("SELECT last_insert_rowid() AS id;")[0].id))!;
}
/** Shadow-only bridge from the unchanged legacy cluster key; no new similarity threshold is implied. */
export function getOrCreateCandidateEvent(input: { candidateKey: string; title: string; category: string; firstSeenAt: number }): EventRecord {
  ensureEventStore();
  if (!input.candidateKey.trim()) throw new Error("candidate key is required");
  return tx(() => {
    const existing = rows<{ event_id: number }>(`SELECT event_id FROM intelligence_candidate_events WHERE candidate_key=${q(input.candidateKey)};`)[0];
    if (existing) return getEvent(existing.event_id)!;
    const event = createEvent({ title: input.title || "Unclassified 𝕏 event", category: input.category || "unclassified", firstSeenAt: input.firstSeenAt });
    exec(`INSERT INTO intelligence_candidate_events(candidate_key,event_id,resolver,created_at) VALUES (${q(input.candidateKey)},${event.id},'legacy_cluster_shadow',${n(input.firstSeenAt)});`);
    return event;
  });
}
export function getEvent(id: number): EventRecord | null { ensureEventStore(); return rows<EventRecord>(`SELECT id,title,category,stage,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,merged_into AS mergedInto FROM intelligence_events WHERE id=${n(id)};`)[0] || null; }
export function attachObservationToEvent(eventId: number, observationId: number, attachedAt: number): void {
  ensureEventStore();
  tx(() => {
    if (!getEvent(eventId) || !getXObservation(observationId)) throw new Error("event or 𝕏 observation not found");
    exec(`INSERT OR IGNORE INTO intelligence_event_observations(event_id,observation_id,attached_at) VALUES (${n(eventId)},${n(observationId)},${n(attachedAt)});`);
    exec(`UPDATE intelligence_events SET first_seen_at=MIN(first_seen_at,(SELECT observed_at FROM intelligence_observations WHERE id=${n(observationId)})),last_seen_at=MAX(last_seen_at,(SELECT observed_at FROM intelligence_observations WHERE id=${n(observationId)})) WHERE id=${n(eventId)};`);
  });
}
export function createClaim(input: { eventId: number; type: string; normalizedText: string; entities?: string[]; firstSeenAt: number; confidenceClass: string; verificationMode: string }): ClaimRecord {
  ensureEventStore();
  if (!getEvent(input.eventId)) throw new Error("event not found");
  exec(`INSERT INTO intelligence_claims(event_id,claim_type,normalized_text,entities_json,first_seen_at,confidence_class,verification_mode) VALUES (${n(input.eventId)},${q(input.type)},${q(input.normalizedText)},${json(input.entities)},${n(input.firstSeenAt)},${q(input.confidenceClass)},${q(input.verificationMode)});`);
  return getClaim(Number(rows<{ id: number }>("SELECT last_insert_rowid() AS id;")[0].id))!;
}
export function getClaim(id: number): ClaimRecord | null { ensureEventStore(); const row = rows<Record<string, unknown>>(`SELECT id,event_id,claim_type,normalized_text,entities_json,first_seen_at,confidence_class,verification_mode FROM intelligence_claims WHERE id=${n(id)};`)[0]; return row ? { id: Number(row.id),eventId:Number(row.event_id),type:String(row.claim_type),normalizedText:String(row.normalized_text),entities:JSON.parse(String(row.entities_json)),firstSeenAt:Number(row.first_seen_at),confidenceClass:String(row.confidence_class),verificationMode:String(row.verification_mode) } : null; }
export function linkObservationClaim(claimId: number, observationId: number, relation: "supports" | "contradicts", linkedAt: number): void {
  ensureEventStore();
  tx(() => {
    const claim = getClaim(claimId);
    if (!claim || !getXObservation(observationId)) throw new Error("claim or 𝕏 observation not found");
    exec(`INSERT OR IGNORE INTO intelligence_event_observations(event_id,observation_id,attached_at) VALUES (${n(claim.eventId)},${n(observationId)},${n(linkedAt)});`);
    exec(`UPDATE intelligence_events SET first_seen_at=MIN(first_seen_at,(SELECT observed_at FROM intelligence_observations WHERE id=${n(observationId)})),last_seen_at=MAX(last_seen_at,(SELECT observed_at FROM intelligence_observations WHERE id=${n(observationId)})) WHERE id=${n(claim.eventId)};`);
    exec(`INSERT OR IGNORE INTO intelligence_claim_evidence(claim_id,observation_id,relation,linked_at) VALUES (${n(claimId)},${n(observationId)},${q(relation)},${n(linkedAt)});`);
  });
}
export function getClaimEvidence(claimId: number): Array<{ observationId: number; relation: "supports" | "contradicts"; linkedAt: number }> {
  ensureEventStore(); return rows<Record<string, unknown>>(`SELECT observation_id,relation,linked_at FROM intelligence_claim_evidence WHERE claim_id=${n(claimId)} ORDER BY linked_at;`).map(row=>({observationId:Number(row.observation_id),relation:row.relation as "supports"|"contradicts",linkedAt:Number(row.linked_at)}));
}
function addAudit(action: "merge"|"split", sourceId: number, targetId: number|null, reason: string, details: unknown, createdAt: number): void {
  exec(`INSERT INTO intelligence_event_audits(action,source_event_id,target_event_id,reason,details_json,created_at) VALUES (${q(action)},${n(sourceId)},${n(targetId)},${q(reason)},${json(details)},${n(createdAt)});`);
}
export function recordEventMerge(input: { sourceEventId: number; targetEventId: number; reason: string; details?: Record<string, unknown>; createdAt: number }): void {
  ensureEventStore(); tx(() => {
    const source=getEvent(input.sourceEventId), target=getEvent(input.targetEventId);
    if (!source || !target || source.id===target.id || source.mergedInto!==null || target.mergedInto!==null) throw new Error("invalid event merge");
    exec(`INSERT OR IGNORE INTO intelligence_event_observations(event_id,observation_id,attached_at) SELECT ${target.id},observation_id,${n(input.createdAt)} FROM intelligence_event_observations WHERE event_id=${source.id};`);
    exec(`UPDATE intelligence_claims SET event_id=${target.id} WHERE event_id=${source.id};`);
    exec(`UPDATE intelligence_events SET first_seen_at=MIN(first_seen_at,${source.firstSeenAt}),last_seen_at=MAX(last_seen_at,${source.lastSeenAt}) WHERE id=${target.id};`);
    exec(`UPDATE intelligence_events SET merged_into=${target.id} WHERE id=${source.id};`);
    addAudit("merge",source.id,target.id,input.reason,input.details,input.createdAt);
  });
}
export function recordEventSplit(input: { sourceEventId: number; observationIds: number[]; title: string; reason: string; details?: Record<string, unknown>; createdAt: number }): EventRecord {
  ensureEventStore();
  if (!input.observationIds.length || new Set(input.observationIds).size!==input.observationIds.length) throw new Error("split requires distinct observations");
  return tx(() => {
    const source=getEvent(input.sourceEventId);
    if (!source || source.mergedInto!==null) throw new Error("invalid source event split");
    for (const id of input.observationIds) if (!rows(`SELECT 1 FROM intelligence_event_observations WHERE event_id=${source.id} AND observation_id=${n(id)};`).length) throw new Error("split observation is not a member of source event");
    const split=createEvent({title:input.title,category:source.category,firstSeenAt:input.createdAt,lastSeenAt:input.createdAt,stage:"SEED"});
    for (const id of input.observationIds) {
      exec(`DELETE FROM intelligence_event_observations WHERE event_id=${source.id} AND observation_id=${n(id)};`);
      exec(`INSERT OR IGNORE INTO intelligence_event_observations(event_id,observation_id,attached_at) VALUES (${split.id},${n(id)},${n(input.createdAt)});`);
    }
    exec(`UPDATE intelligence_claims SET event_id=${split.id} WHERE event_id=${source.id}
      AND EXISTS (SELECT 1 FROM intelligence_claim_evidence ce JOIN intelligence_event_observations eo ON eo.observation_id=ce.observation_id WHERE ce.claim_id=intelligence_claims.id AND eo.event_id=${split.id})
      AND NOT EXISTS (SELECT 1 FROM intelligence_claim_evidence ce JOIN intelligence_event_observations eo ON eo.observation_id=ce.observation_id WHERE ce.claim_id=intelligence_claims.id AND eo.event_id=${source.id});`);
    const membership=rows<{min_time:number|null;max_time:number|null}>(`SELECT MIN(o.observed_at) min_time,MAX(o.observed_at) max_time FROM intelligence_event_observations eo JOIN intelligence_observations o ON o.id=eo.observation_id WHERE eo.event_id=${source.id};`)[0];
    if (membership?.min_time!==null) exec(`UPDATE intelligence_events SET first_seen_at=${n(membership.min_time)},last_seen_at=${n(membership.max_time)} WHERE id=${source.id};`);
    addAudit("split",source.id,split.id,input.reason,{...input.details,observationIds:input.observationIds},input.createdAt);
    return getEvent(split.id)!;
  });
}
export function listEventAudits(eventId?: number): EventAudit[] {
  ensureEventStore(); const where=eventId===undefined?"":` WHERE source_event_id=${n(eventId)} OR target_event_id=${n(eventId)}`;
  return rows<Record<string, unknown>>(`SELECT * FROM intelligence_event_audits${where} ORDER BY id;`).map(row=>({id:Number(row.id),action:row.action as "merge"|"split",sourceEventId:Number(row.source_event_id),targetEventId:row.target_event_id===null?null:Number(row.target_event_id),reason:String(row.reason),details:JSON.parse(String(row.details_json)),createdAt:Number(row.created_at)}));
}
export function getEventIntelligenceSnapshot(eventId: number): { event: EventRecord; claims: ClaimRecord[]; observations: XObservation[]; evidence: Array<{ claimId:number; observationId:number; relation:string }> } | null {
  ensureEventStore(); const event=getEvent(eventId); if(!event)return null;
  const claimRows=rows<{id:number}>(`SELECT id FROM intelligence_claims WHERE event_id=${n(eventId)} ORDER BY id;`);
  const claims=claimRows.map(row=>getClaim(row.id)!); const observations=listXObservations(eventId);
  const evidence=rows<Record<string, unknown>>(`SELECT ce.claim_id,ce.observation_id,ce.relation FROM intelligence_claim_evidence ce JOIN intelligence_claims c ON c.id=ce.claim_id WHERE c.event_id=${n(eventId)} ORDER BY ce.claim_id,ce.observation_id;`).map(row=>({claimId:Number(row.claim_id),observationId:Number(row.observation_id),relation:String(row.relation)}));
  return {event,claims,observations,evidence};
}
export function saveSemanticThresholdProfile(profile: SemanticThresholdProfile, createdAt: number): number {
  ensureEventStore();
  if (!profile.model || !profile.language || !profile.category || !profile.comparisonKind || !profile.version || !profile.fixtureHash) throw new Error("threshold calibration scope and provenance are required");
  if (profile.threshold !== null && (profile.threshold < 0 || profile.threshold > 1)) throw new Error("semantic threshold must be between zero and one");
  exec(`INSERT INTO intelligence_threshold_profiles(model,language,category,comparison_kind,version,threshold,sample_count,positive_count,negative_count,balanced_accuracy,status,fixture_hash,created_at)
    VALUES (${q(profile.model)},${q(profile.language)},${q(profile.category)},${q(profile.comparisonKind)},${q(profile.version)},${n(profile.threshold)},${n(profile.sampleCount)},${n(profile.positiveCount)},${n(profile.negativeCount)},${n(profile.balancedAccuracy)},${q(profile.status)},${q(profile.fixtureHash)},${n(createdAt)});`);
  return Number(rows<{id:number}>("SELECT last_insert_rowid() id;")[0].id);
}
export function getLatestSemanticThresholdProfile(scope: { model: string; language: string; category: string; comparisonKind: string }): (SemanticThresholdProfile & { createdAt: number }) | null {
  ensureEventStore();
  const row=rows<Record<string,unknown>>(`SELECT * FROM intelligence_threshold_profiles WHERE model=${q(scope.model)} AND language=${q(scope.language)} AND category=${q(scope.category)} AND comparison_kind=${q(scope.comparisonKind)} ORDER BY id DESC LIMIT 1;`)[0];
  return row?{model:String(row.model),language:String(row.language),category:String(row.category),comparisonKind:String(row.comparison_kind),version:String(row.version),threshold:row.threshold===null?null:Number(row.threshold),sampleCount:Number(row.sample_count),positiveCount:Number(row.positive_count),negativeCount:Number(row.negative_count),balancedAccuracy:row.balanced_accuracy===null?null:Number(row.balanced_accuracy),status:row.status as "calibrated"|"insufficient",fixtureHash:String(row.fixture_hash),createdAt:Number(row.created_at)}:null;
}
export function closeEventStoreForTests(): void { database=undefined; initialized=false; }
export function provenanceHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
