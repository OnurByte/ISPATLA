import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getPostgresDb } from "./postgres";

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

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> };
async function rows<T>(executor: Executor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await executor.execute(query)).rows as T[];
}
const db = () => getPostgresDb() as unknown as Executor;
const json = (value: unknown) => JSON.stringify(value ?? null);
const num = (value: unknown) => value === null || value === undefined ? null : Number(value);

function mapEvent(row: Record<string, unknown>): EventRecord {
  return { id: Number(row.id), title: String(row.title), category: String(row.category), stage: String(row.stage), firstSeenAt: Number(row.first_seen_at), lastSeenAt: Number(row.last_seen_at), mergedInto: num(row.merged_into) };
}
function mapClaim(row: Record<string, unknown>): ClaimRecord {
  return { id: Number(row.id), eventId: Number(row.event_id), type: String(row.claim_type), normalizedText: String(row.normalized_text), entities: JSON.parse(String(row.entities_json)), firstSeenAt: Number(row.first_seen_at), confidenceClass: String(row.confidence_class), verificationMode: String(row.verification_mode) };
}
function mapObservation(row: Record<string, unknown>, metric: Record<string, unknown>, immutableConflict = false): XObservation {
  return {
    id: Number(row.id), xPostId: String(row.x_post_id), authorId: String(row.author_id), authorHandle: String(row.author_handle),
    observedAt: Number(row.observed_at), postCreatedAt: Number(row.post_created_at), textSnapshot: String(row.text_snapshot),
    referencedPosts: JSON.parse(String(row.referenced_posts_json)), urls: JSON.parse(String(row.urls_json)), media: JSON.parse(String(row.media_json)),
    language: String(row.language), readerProvider: String(row.reader_provider), rawHash: String(row.raw_hash), immutableConflict,
    metrics: { capturedAt: Number(metric.captured_at), likes: num(metric.likes), replies: num(metric.replies), reposts: num(metric.reposts), quotes: num(metric.quotes), views: num(metric.views), censored: JSON.parse(String(metric.censored_json)) }, metricRevision: Number(metric.revision),
  };
}
async function getObservation(executor: Executor, id: number): Promise<XObservation | null> {
  const [row] = await rows<Record<string, unknown>>(executor, sql`SELECT * FROM ispatla_app.intelligence_observations WHERE id=${id}`);
  if (!row) return null;
  const [metric] = await rows<Record<string, unknown>>(executor, sql`SELECT * FROM ispatla_app.intelligence_metric_revisions WHERE observation_id=${id} ORDER BY revision DESC LIMIT 1`);
  return metric ? mapObservation(row, metric) : null;
}
async function getEventWith(executor: Executor, id: number): Promise<EventRecord | null> {
  const [row] = await rows<Record<string, unknown>>(executor, sql`SELECT id,title,category,stage,first_seen_at,last_seen_at,merged_into FROM ispatla_app.intelligence_events WHERE id=${id} FOR UPDATE`);
  return row ? mapEvent(row) : null;
}
async function getClaimWith(executor: Executor, id: number): Promise<ClaimRecord | null> {
  const [row] = await rows<Record<string, unknown>>(executor, sql`SELECT id,event_id,claim_type,normalized_text,entities_json,first_seen_at,confidence_class,verification_mode FROM ispatla_app.intelligence_claims WHERE id=${id}`);
  return row ? mapClaim(row) : null;
}
async function insertEvent(executor: Executor, input: { title: string; category: string; firstSeenAt: number; lastSeenAt?: number; stage?: string }): Promise<EventRecord> {
  const [row] = await rows<Record<string, unknown>>(executor, sql`INSERT INTO ispatla_app.intelligence_events(title,category,stage,first_seen_at,last_seen_at) VALUES (${input.title},${input.category},${input.stage || "SEED"},${input.firstSeenAt},${input.lastSeenAt ?? input.firstSeenAt}) RETURNING id,title,category,stage,first_seen_at,last_seen_at,merged_into`);
  return mapEvent(row);
}
async function addAudit(executor: Executor, action: "merge" | "split", sourceId: number, targetId: number | null, reason: string, details: unknown, createdAt: number): Promise<void> {
  await executor.execute(sql`INSERT INTO ispatla_app.intelligence_event_audits(action,source_event_id,target_event_id,reason,details_json,created_at) VALUES (${action},${sourceId},${targetId},${reason},${json(details)},${createdAt})`);
}

export async function upsertXObservation(input: XObservationInput): Promise<XObservation> {
  if (!input.xPostId.trim() || !input.authorId.trim() || !input.readerProvider.trim() || !input.rawHash.trim()) throw new Error("𝕏 observation requires post, author, provider, and raw provenance");
  if (![input.observedAt, input.postCreatedAt, input.metrics.capturedAt].every(Number.isFinite)) throw new Error("observation timestamps must be finite");
  for (const key of ["likes", "replies", "reposts", "quotes", "views"] as const) { const value = input.metrics[key]; if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`invalid ${key} metric`); }
  return getPostgresDb().transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    let [row] = await rows<Record<string, unknown>>(executor, sql`SELECT * FROM ispatla_app.intelligence_observations WHERE x_post_id=${input.xPostId} FOR UPDATE`);
    let conflict = Boolean(row && (row.author_id !== input.authorId || Number(row.post_created_at) !== input.postCreatedAt || row.raw_hash !== input.rawHash || row.text_snapshot !== input.textSnapshot));
    if (!row) {
      [row] = await rows<Record<string, unknown>>(executor, sql`INSERT INTO ispatla_app.intelligence_observations(x_post_id,author_id,author_handle,observed_at,post_created_at,text_snapshot,referenced_posts_json,urls_json,media_json,language,reader_provider,raw_hash,first_seen_at)
        VALUES (${input.xPostId},${input.authorId},${input.authorHandle},${input.observedAt},${input.postCreatedAt},${input.textSnapshot},${json(input.referencedPosts)},${json(input.urls)},${json(input.media)},${input.language || ""},${input.readerProvider},${input.rawHash},${input.observedAt}) ON CONFLICT(x_post_id) DO NOTHING RETURNING *`);
      if (!row) {
        [row] = await rows<Record<string, unknown>>(executor, sql`SELECT * FROM ispatla_app.intelligence_observations WHERE x_post_id=${input.xPostId} FOR UPDATE`);
        conflict = Boolean(row && (row.author_id !== input.authorId || Number(row.post_created_at) !== input.postCreatedAt || row.raw_hash !== input.rawHash || row.text_snapshot !== input.textSnapshot));
      } else {
        for (const reference of input.referencedPosts || []) await executor.execute(sql`INSERT INTO ispatla_app.intelligence_lineage(observation_id,referenced_post_id,relation) VALUES (${row.id},${reference.xPostId},${reference.kind}) ON CONFLICT DO NOTHING`);
      }
    }
    const [latest] = await rows<{ revision: number | string }>(executor, sql`SELECT revision FROM ispatla_app.intelligence_metric_revisions WHERE observation_id=${row.id} ORDER BY revision DESC LIMIT 1`);
    const revision = Number(latest?.revision || 0) + 1;
    const m = input.metrics;
    const [metric] = await rows<Record<string, unknown>>(executor, sql`INSERT INTO ispatla_app.intelligence_metric_revisions(observation_id,revision,captured_at,likes,replies,reposts,quotes,views,censored_json,reader_provider,raw_hash,received_at)
      VALUES (${row.id},${revision},${m.capturedAt},${m.likes},${m.replies},${m.reposts},${m.quotes},${m.views},${json(m.censored)},${input.readerProvider},${input.rawHash},${input.observedAt}) RETURNING *`);
    return mapObservation(row, metric, conflict);
  });
}
export async function getXObservation(id: number): Promise<XObservation | null> { return getObservation(db(), id); }
export async function listXObservations(eventId?: number): Promise<XObservation[]> {
  const ids = eventId === undefined
    ? await rows<{ id: number | string }>(db(), sql`SELECT id FROM ispatla_app.intelligence_observations ORDER BY observed_at,id`)
    : await rows<{ observation_id: number | string }>(db(), sql`SELECT observation_id FROM ispatla_app.intelligence_event_observations WHERE event_id=${eventId} ORDER BY attached_at,observation_id`);
  return (await Promise.all(ids.map((r) => getObservation(db(), Number("id" in r ? r.id : r.observation_id))))).filter((r): r is XObservation => !!r);
}
export async function createEvent(input: { title: string; category: string; firstSeenAt: number; lastSeenAt?: number; stage?: string }): Promise<EventRecord> {
  if (!input.title.trim() || !input.category.trim()) throw new Error("event title and category are required");
  return insertEvent(db(), input);
}
/** Shadow-only bridge from the unchanged legacy cluster key; no new similarity threshold is implied. */
export async function getOrCreateCandidateEvent(input: { candidateKey: string; title: string; category: string; firstSeenAt: number }): Promise<EventRecord> {
  if (!input.candidateKey.trim()) throw new Error("candidate key is required");
  return getPostgresDb().transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.candidateKey}, 0))`);
    const [existing] = await rows<{ event_id: number | string }>(executor, sql`SELECT event_id FROM ispatla_app.intelligence_candidate_events WHERE candidate_key=${input.candidateKey} FOR UPDATE`);
    if (existing) return (await getEventWith(executor, Number(existing.event_id)))!;
    const event = await insertEvent(executor, { title: input.title || "Unclassified 𝕏 event", category: input.category || "unclassified", firstSeenAt: input.firstSeenAt });
    await executor.execute(sql`INSERT INTO ispatla_app.intelligence_candidate_events(candidate_key,event_id,resolver,created_at) VALUES (${input.candidateKey},${event.id},'legacy_cluster_shadow',${input.firstSeenAt}) ON CONFLICT(candidate_key) DO NOTHING`);
    const [current] = await rows<{ event_id: number | string }>(executor, sql`SELECT event_id FROM ispatla_app.intelligence_candidate_events WHERE candidate_key=${input.candidateKey}`);
    return (await getEventWith(executor, Number(current.event_id)))!;
  });
}
export async function getEvent(id: number): Promise<EventRecord | null> { return getEventWith(db(), id); }
export async function attachObservationToEvent(eventId: number, observationId: number, attachedAt: number): Promise<void> {
  await getPostgresDb().transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    if (!await getEventWith(executor, eventId) || !await getObservation(executor, observationId)) throw new Error("event or 𝕏 observation not found");
    await executor.execute(sql`INSERT INTO ispatla_app.intelligence_event_observations(event_id,observation_id,attached_at) VALUES (${eventId},${observationId},${attachedAt}) ON CONFLICT DO NOTHING`);
    await executor.execute(sql`UPDATE ispatla_app.intelligence_events SET first_seen_at=LEAST(first_seen_at,(SELECT observed_at FROM ispatla_app.intelligence_observations WHERE id=${observationId})),last_seen_at=GREATEST(last_seen_at,(SELECT observed_at FROM ispatla_app.intelligence_observations WHERE id=${observationId})) WHERE id=${eventId}`);
  });
}
export async function createClaim(input: { eventId: number; type: string; normalizedText: string; entities?: string[]; firstSeenAt: number; confidenceClass: string; verificationMode: string }): Promise<ClaimRecord> {
  if (!await getEvent(input.eventId)) throw new Error("event not found");
  const [row] = await rows<Record<string, unknown>>(db(), sql`INSERT INTO ispatla_app.intelligence_claims(event_id,claim_type,normalized_text,entities_json,first_seen_at,confidence_class,verification_mode) VALUES (${input.eventId},${input.type},${input.normalizedText},${json(input.entities)},${input.firstSeenAt},${input.confidenceClass},${input.verificationMode}) RETURNING id,event_id,claim_type,normalized_text,entities_json,first_seen_at,confidence_class,verification_mode`);
  return mapClaim(row);
}
export async function getClaim(id: number): Promise<ClaimRecord | null> { return getClaimWith(db(), id); }
export async function linkObservationClaim(claimId: number, observationId: number, relation: "supports" | "contradicts", linkedAt: number): Promise<void> {
  await getPostgresDb().transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    const claim = await getClaimWith(executor, claimId);
    if (!claim || !await getObservation(executor, observationId)) throw new Error("claim or 𝕏 observation not found");
    await executor.execute(sql`INSERT INTO ispatla_app.intelligence_event_observations(event_id,observation_id,attached_at) VALUES (${claim.eventId},${observationId},${linkedAt}) ON CONFLICT DO NOTHING`);
    await executor.execute(sql`UPDATE ispatla_app.intelligence_events SET first_seen_at=LEAST(first_seen_at,(SELECT observed_at FROM ispatla_app.intelligence_observations WHERE id=${observationId})),last_seen_at=GREATEST(last_seen_at,(SELECT observed_at FROM ispatla_app.intelligence_observations WHERE id=${observationId})) WHERE id=${claim.eventId}`);
    await executor.execute(sql`INSERT INTO ispatla_app.intelligence_claim_evidence(claim_id,observation_id,relation,linked_at) VALUES (${claimId},${observationId},${relation},${linkedAt}) ON CONFLICT DO NOTHING`);
  });
}
export async function getClaimEvidence(claimId: number): Promise<Array<{ observationId: number; relation: "supports" | "contradicts"; linkedAt: number }>> {
  return (await rows<Record<string, unknown>>(db(), sql`SELECT observation_id,relation,linked_at FROM ispatla_app.intelligence_claim_evidence WHERE claim_id=${claimId} ORDER BY linked_at`)).map((r) => ({ observationId: Number(r.observation_id), relation: r.relation as "supports" | "contradicts", linkedAt: Number(r.linked_at) }));
}
export async function recordEventMerge(input: { sourceEventId: number; targetEventId: number; reason: string; details?: Record<string, unknown>; createdAt: number }): Promise<void> {
  await getPostgresDb().transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    const source = await getEventWith(executor, input.sourceEventId), target = await getEventWith(executor, input.targetEventId);
    if (!source || !target || source.id === target.id || source.mergedInto !== null || target.mergedInto !== null) throw new Error("invalid event merge");
    await executor.execute(sql`INSERT INTO ispatla_app.intelligence_event_observations(event_id,observation_id,attached_at) SELECT ${target.id},observation_id,${input.createdAt} FROM ispatla_app.intelligence_event_observations WHERE event_id=${source.id} ON CONFLICT DO NOTHING`);
    await executor.execute(sql`UPDATE ispatla_app.intelligence_claims SET event_id=${target.id} WHERE event_id=${source.id}`);
    await executor.execute(sql`UPDATE ispatla_app.intelligence_events SET first_seen_at=LEAST(first_seen_at,${source.firstSeenAt}),last_seen_at=GREATEST(last_seen_at,${source.lastSeenAt}) WHERE id=${target.id}`);
    await executor.execute(sql`UPDATE ispatla_app.intelligence_events SET merged_into=${target.id} WHERE id=${source.id}`);
    await addAudit(executor, "merge", source.id, target.id, input.reason, input.details, input.createdAt);
  });
}
export async function recordEventSplit(input: { sourceEventId: number; observationIds: number[]; title: string; reason: string; details?: Record<string, unknown>; createdAt: number }): Promise<EventRecord> {
  if (!input.observationIds.length || new Set(input.observationIds).size !== input.observationIds.length) throw new Error("split requires distinct observations");
  return getPostgresDb().transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    const source = await getEventWith(executor, input.sourceEventId);
    if (!source || source.mergedInto !== null) throw new Error("invalid source event split");
    for (const id of input.observationIds) {
      const [member] = await rows(executor, sql`SELECT 1 FROM ispatla_app.intelligence_event_observations WHERE event_id=${source.id} AND observation_id=${id}`);
      if (!member) throw new Error("split observation is not a member of source event");
    }
    const split = await insertEvent(executor, { title: input.title, category: source.category, firstSeenAt: input.createdAt, stage: "SEED" });
    for (const id of input.observationIds) {
      await executor.execute(sql`DELETE FROM ispatla_app.intelligence_event_observations WHERE event_id=${source.id} AND observation_id=${id}`);
      await executor.execute(sql`INSERT INTO ispatla_app.intelligence_event_observations(event_id,observation_id,attached_at) VALUES (${split.id},${id},${input.createdAt}) ON CONFLICT DO NOTHING`);
    }
    await executor.execute(sql`UPDATE ispatla_app.intelligence_claims c SET event_id=${split.id} WHERE c.event_id=${source.id}
      AND EXISTS (SELECT 1 FROM ispatla_app.intelligence_claim_evidence ce JOIN ispatla_app.intelligence_event_observations eo ON eo.observation_id=ce.observation_id WHERE ce.claim_id=c.id AND eo.event_id=${split.id})
      AND NOT EXISTS (SELECT 1 FROM ispatla_app.intelligence_claim_evidence ce JOIN ispatla_app.intelligence_event_observations eo ON eo.observation_id=ce.observation_id WHERE ce.claim_id=c.id AND eo.event_id=${source.id})`);
    const [membership] = await rows<Record<string, unknown>>(executor, sql`SELECT MIN(o.observed_at) AS min_time,MAX(o.observed_at) AS max_time FROM ispatla_app.intelligence_event_observations eo JOIN ispatla_app.intelligence_observations o ON o.id=eo.observation_id WHERE eo.event_id=${source.id}`);
    if (membership.min_time !== null) await executor.execute(sql`UPDATE ispatla_app.intelligence_events SET first_seen_at=${membership.min_time},last_seen_at=${membership.max_time} WHERE id=${source.id}`);
    await addAudit(executor, "split", source.id, split.id, input.reason, { ...input.details, observationIds: input.observationIds }, input.createdAt);
    return split;
  });
}
export async function listEventAudits(eventId?: number): Promise<EventAudit[]> {
  const result = eventId === undefined
    ? await rows<Record<string, unknown>>(db(), sql`SELECT * FROM ispatla_app.intelligence_event_audits ORDER BY id`)
    : await rows<Record<string, unknown>>(db(), sql`SELECT * FROM ispatla_app.intelligence_event_audits WHERE source_event_id=${eventId} OR target_event_id=${eventId} ORDER BY id`);
  return result.map((r) => ({ id: Number(r.id), action: r.action as "merge" | "split", sourceEventId: Number(r.source_event_id), targetEventId: num(r.target_event_id), reason: String(r.reason), details: JSON.parse(String(r.details_json)), createdAt: Number(r.created_at) }));
}
export async function getEventIntelligenceSnapshot(eventId: number): Promise<{ event: EventRecord; claims: ClaimRecord[]; observations: XObservation[]; evidence: Array<{ claimId: number; observationId: number; relation: string }> } | null> {
  const executor = db(), event = await getEventWith(executor, eventId);
  if (!event) return null;
  const claimRows = await rows<Record<string, unknown>>(executor, sql`SELECT id,event_id,claim_type,normalized_text,entities_json,first_seen_at,confidence_class,verification_mode FROM ispatla_app.intelligence_claims WHERE event_id=${eventId} ORDER BY id`);
  const claims = claimRows.map(mapClaim), observations = await listXObservations(eventId);
  const evidence = (await rows<Record<string, unknown>>(executor, sql`SELECT ce.claim_id,ce.observation_id,ce.relation FROM ispatla_app.intelligence_claim_evidence ce JOIN ispatla_app.intelligence_claims c ON c.id=ce.claim_id WHERE c.event_id=${eventId} ORDER BY ce.claim_id,ce.observation_id`)).map((r) => ({ claimId: Number(r.claim_id), observationId: Number(r.observation_id), relation: String(r.relation) }));
  return { event, claims, observations, evidence };
}
export async function saveSemanticThresholdProfile(profile: SemanticThresholdProfile, createdAt: number): Promise<number> {
  if (!profile.model || !profile.language || !profile.category || !profile.comparisonKind || !profile.version || !profile.fixtureHash) throw new Error("threshold calibration scope and provenance are required");
  if (profile.threshold !== null && (profile.threshold < 0 || profile.threshold > 1)) throw new Error("semantic threshold must be between zero and one");
  const [row] = await rows<{ id: number | string }>(db(), sql`INSERT INTO ispatla_app.intelligence_threshold_profiles(model,language,category,comparison_kind,version,threshold,sample_count,positive_count,negative_count,balanced_accuracy,status,fixture_hash,created_at)
    VALUES (${profile.model},${profile.language},${profile.category},${profile.comparisonKind},${profile.version},${profile.threshold},${profile.sampleCount},${profile.positiveCount},${profile.negativeCount},${profile.balancedAccuracy},${profile.status},${profile.fixtureHash},${createdAt}) RETURNING id`);
  return Number(row.id);
}
export async function getLatestSemanticThresholdProfile(scope: { model: string; language: string; category: string; comparisonKind: string }): Promise<(SemanticThresholdProfile & { createdAt: number }) | null> {
  const [r] = await rows<Record<string, unknown>>(db(), sql`SELECT * FROM ispatla_app.intelligence_threshold_profiles WHERE model=${scope.model} AND language=${scope.language} AND category=${scope.category} AND comparison_kind=${scope.comparisonKind} ORDER BY id DESC LIMIT 1`);
  return r ? { model: String(r.model), language: String(r.language), category: String(r.category), comparisonKind: String(r.comparison_kind), version: String(r.version), threshold: num(r.threshold), sampleCount: Number(r.sample_count), positiveCount: Number(r.positive_count), negativeCount: Number(r.negative_count), balancedAccuracy: num(r.balanced_accuracy), status: r.status as "calibrated" | "insufficient", fixtureHash: String(r.fixture_hash), createdAt: Number(r.created_at) } : null;
}
export function provenanceHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
