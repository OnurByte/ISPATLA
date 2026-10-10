import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";
import { accounts, draftRevisions, drafts } from "./postgres-schema";
import { automationJobEvents, automationJobs, publicationApprovalSnapshots, publicationIntentEvents, publicationIntents } from "./postgres-queue-schema";
import type { AutomationJob, PublicationIntent } from "./db-types";

function owner() {
  const id = currentOwnerId();
  if (!id) throw new Error("Oturum gerekli");
  return id;
}

function mapJob(row: typeof automationJobs.$inferSelect, handle: string | null): AutomationJob {
  return { id: row.id, draftId: row.draftId, accountId: row.accountId, accountHandle: handle || "", action: row.action,
    scheduledAt: row.scheduledAt, status: row.status, receipt: row.receipt, reason: row.reason, remoteUrl: row.remoteUrl,
    reconciliationStatus: row.reconciliationStatus, attempts: row.attempts, maxAttempts: row.maxAttempts, leaseToken: row.leaseToken,
    leaseUntil: row.leaseUntil, heartbeatAt: row.heartbeatAt, nextAttemptAt: row.nextAttemptAt, errorClass: row.errorClass,
    deadLetteredAt: row.deadLetteredAt, approvalExpiresAt: row.approvalExpiresAt, approvalSnapshotId: row.approvalSnapshotId,
    remoteWriteStartedAt: row.remoteWriteStartedAt, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function mapIntent(row: typeof publicationIntents.$inferSelect, handle: string | null): PublicationIntent {
  return { id: row.id, draftId: row.draftId, accountId: row.accountId, accountHandle: handle || "", status: row.status as PublicationIntent["status"],
    idempotencyKey: row.idempotencyKey, text: row.text, mediaPath: row.mediaPath, mediaHash: row.mediaHash, receipt: row.receipt,
    remoteUrl: row.remoteUrl, remotePostId: row.remotePostId, reason: row.reason, requestedAt: row.requestedAt, approvedAt: row.approvedAt,
    approvalExpiresAt: row.approvalExpiresAt, approvalSnapshotId: row.approvalSnapshotId, dispatchedAt: row.dispatchedAt,
    confirmedAt: row.confirmedAt, updatedAt: row.updatedAt, leaseToken: row.leaseToken, leaseUntil: row.leaseUntil, heartbeatAt: row.heartbeatAt,
    attempts: row.attempts, maxAttempts: row.maxAttempts, nextAttemptAt: row.nextAttemptAt, errorClass: row.errorClass,
    deadLetteredAt: row.deadLetteredAt, remoteWriteStartedAt: row.remoteWriteStartedAt };
}

export async function listPostgresQueueJobs(limit = 100): Promise<AutomationJob[]> {
  const current = owner();
  const rows = await getPostgresDb().select({ job: automationJobs, handle: accounts.handle }).from(automationJobs)
    .innerJoin(drafts, eq(drafts.id, automationJobs.draftId)).leftJoin(accounts, and(eq(accounts.id, automationJobs.accountId), eq(accounts.ownerUserId, current)))
    .where(eq(drafts.ownerUserId, current)).orderBy(desc(automationJobs.scheduledAt), desc(automationJobs.id)).limit(Math.max(1, Math.min(500, limit)));
  return rows.map(({ job, handle }) => mapJob(job, handle));
}

export async function getPostgresQueueJob(id: number): Promise<AutomationJob | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const current = owner();
  const [row] = await getPostgresDb().select({ job: automationJobs, handle: accounts.handle }).from(automationJobs)
    .innerJoin(drafts, eq(drafts.id, automationJobs.draftId)).leftJoin(accounts, and(eq(accounts.id, automationJobs.accountId), eq(accounts.ownerUserId, current)))
    .where(and(eq(automationJobs.id, id), eq(drafts.ownerUserId, current))).limit(1);
  return row ? mapJob(row.job, row.handle) : null;
}

export async function updatePostgresQueueJob(input: { id: number; status?: string; reason?: string; now: number }): Promise<AutomationJob | null> {
  const current = await getPostgresQueueJob(input.id);
  if (!current || !["queued", "cancelled"].includes(input.status || current.status)) return null;
  const ownerId = owner();
  const changed = await getPostgresDb().update(automationJobs).set({
    ...(input.status ? { status: input.status } : {}), ...(input.reason !== undefined ? { reason: input.reason } : {}), updatedAt: input.now,
  }).where(and(eq(automationJobs.id, input.id), or(eq(automationJobs.status, "queued"), eq(automationJobs.status, "failed")), isNull(automationJobs.leaseToken),
    isNull(automationJobs.remoteWriteStartedAt), sql`EXISTS (SELECT 1 FROM ispatla_app.drafts d WHERE d.id = ${automationJobs.draftId} AND d.owner_user_id = ${ownerId})`)).returning({ id: automationJobs.id });
  return changed.length ? getPostgresQueueJob(input.id) : null;
}

export async function createPostgresQueueJob(input: { draftId: number; accountId: number; action: string; scheduledAt: number; now: number }): Promise<AutomationJob> {
  const ownerId = owner(), db = getPostgresDb();
  const [found] = await db.select({ draft: drafts, handle: accounts.handle }).from(drafts).innerJoin(accounts, and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, ownerId)))
    .where(and(eq(drafts.id, input.draftId), eq(drafts.ownerUserId, ownerId))).limit(1);
  if (!found || found.draft.accountId !== input.accountId) throw new Error("draft/account owner eşleşmesi bulunamadı");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${ownerId}:${input.draftId}:${input.accountId}:${input.action}`}), hashtext('ispatla_queue_job'))`);
    const [existing] = await tx.select().from(automationJobs).where(and(eq(automationJobs.draftId, input.draftId), eq(automationJobs.accountId, input.accountId),
      eq(automationJobs.action, input.action), or(eq(automationJobs.status, "queued"), eq(automationJobs.status, "running"), eq(automationJobs.status, "pending_reconciliation"))))
      .orderBy(desc(automationJobs.id)).for("update").limit(1);
    if (existing) return mapJob(existing, found.handle);
    const [row] = await tx.insert(automationJobs).values({ draftId: input.draftId, accountId: input.accountId, action: input.action,
      scheduledAt: input.scheduledAt, status: "queued", createdAt: input.now, updatedAt: input.now, nextAttemptAt: input.now }).returning();
    const [revision] = await tx.select({ revision: sql<number>`coalesce(max(${draftRevisions.revision}), 0) + 1` }).from(draftRevisions)
      .where(and(eq(draftRevisions.draftId, input.draftId), eq(draftRevisions.ownerUserId, ownerId)));
    const expiresAt = input.now + (found.draft.externalId || found.draft.sourceUrl || found.draft.sourceHandle ? 900 : 86400);
    const targetId = found.draft.sourceUrl.match(/\/status\/(\d{1,19})/)?.[1] || (/^(reply|repost|quote)$/.test(input.action) ? found.draft.externalId : "");
    const [snapshot] = await tx.insert(publicationApprovalSnapshots).values({ entityType: "automation_job", entityId: row.id, draftId: input.draftId,
      draftRevision: Number(revision?.revision || 1), text: found.draft.text, accountId: input.accountId, action: input.action, format: found.draft.format,
      targetId, externalId: found.draft.externalId, sourceHandle: found.draft.sourceHandle, sourceUrl: found.draft.sourceUrl, mediaHash: "",
      approvalSource: "human", approvedAt: input.now, expiresAt }).returning({ id: publicationApprovalSnapshots.id });
    const [job] = await tx.update(automationJobs).set({ approvalExpiresAt: expiresAt, approvalSnapshotId: snapshot.id }).where(eq(automationJobs.id, row.id)).returning();
    await tx.insert(automationJobEvents).values([
      { jobId: row.id, event: "created", status: "queued", errorClass: "", createdAt: input.now },
      { jobId: row.id, event: "scheduled", status: "queued", errorClass: "", createdAt: input.now },
    ]);
    await tx.update(drafts).set({ status: "queued", updatedAt: input.now }).where(and(eq(drafts.id, input.draftId), eq(drafts.ownerUserId, ownerId)));
    return mapJob(job, found.handle);
  });
}

export async function listPostgresPublicationIntents(limit = 200, status?: string): Promise<PublicationIntent[]> {
  const current = owner();
  const rows = await getPostgresDb().select({ intent: publicationIntents, handle: accounts.handle }).from(publicationIntents)
    .innerJoin(drafts, eq(drafts.id, publicationIntents.draftId)).leftJoin(accounts, and(eq(accounts.id, publicationIntents.accountId), eq(accounts.ownerUserId, current)))
    .where(and(eq(drafts.ownerUserId, current), status ? eq(publicationIntents.status, status) : undefined))
    .orderBy(asc(publicationIntents.requestedAt), asc(publicationIntents.id)).limit(Math.max(1, Math.min(500, limit)));
  return rows.map(({ intent, handle }) => mapIntent(intent, handle));
}

export async function getPostgresPublicationIntent(id: number): Promise<PublicationIntent | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const current = owner();
  const [row] = await getPostgresDb().select({ intent: publicationIntents, handle: accounts.handle }).from(publicationIntents)
    .innerJoin(drafts, eq(drafts.id, publicationIntents.draftId)).leftJoin(accounts, and(eq(accounts.id, publicationIntents.accountId), eq(accounts.ownerUserId, current)))
    .where(and(eq(publicationIntents.id, id), eq(drafts.ownerUserId, current))).limit(1);
  return row ? mapIntent(row.intent, row.handle) : null;
}

export async function setPostgresPublicationIntentStatus(input: { id: number; status: string; reason?: string; now: number }): Promise<PublicationIntent | null> {
  const current = await getPostgresPublicationIntent(input.id);
  if (!current || !["pending_approval", "approved", "blocked", "cancelled", "expired"].includes(input.status)) return null;
  if (current.leaseToken || current.remoteWriteStartedAt !== null) return null;
  const ownerId = owner();
  const changed = await getPostgresDb().transaction(async (tx) => {
    const rows = await tx.update(publicationIntents).set({ status: input.status, reason: input.reason ?? current.reason, updatedAt: input.now })
      .where(and(eq(publicationIntents.id, input.id), eq(publicationIntents.status, current.status), isNull(publicationIntents.leaseToken), isNull(publicationIntents.remoteWriteStartedAt),
        sql`EXISTS (SELECT 1 FROM ispatla_app.drafts d WHERE d.id = ${publicationIntents.draftId} AND d.owner_user_id = ${ownerId})`)).returning({ id: publicationIntents.id });
    if (rows.length && input.status === "cancelled") await tx.update(drafts).set({ status: "draft", updatedAt: input.now })
      .where(and(eq(drafts.id, current.draftId), eq(drafts.ownerUserId, ownerId)));
    return rows.length > 0;
  });
  return changed ? getPostgresPublicationIntent(input.id) : null;
}

export async function approvePostgresPublicationIntent(input: { id: number; now: number; source?: "human" | "automatic" }): Promise<PublicationIntent | null> {
  const current = await getPostgresPublicationIntent(input.id);
  if (!current || current.status !== "pending_approval") return current?.status === "approved" && (current.approvalExpiresAt ?? 0) > input.now ? current : null;
  const ownerId = owner(), db = getPostgresDb();
  const approved = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ intent: publicationIntents, draft: drafts }).from(publicationIntents).innerJoin(drafts, eq(drafts.id, publicationIntents.draftId))
      .where(and(eq(publicationIntents.id, input.id), eq(drafts.ownerUserId, ownerId), eq(publicationIntents.status, "pending_approval"))).for("update").limit(1);
    if (!locked) return false;
    const [latest] = await tx.select({ revision: sql<number>`coalesce(max(${draftRevisions.revision}), 0) + 1` }).from(draftRevisions)
      .where(and(eq(draftRevisions.draftId, locked.draft.id), eq(draftRevisions.ownerUserId, ownerId)));
    const expiresAt = input.now + (locked.draft.externalId || locked.draft.sourceUrl || locked.draft.sourceHandle ? 900 : 86400);
    const targetId = locked.draft.sourceUrl.match(/\/status\/(\d{1,19})/)?.[1] || "";
    const [snapshot] = await tx.insert(publicationApprovalSnapshots).values({ entityType: "publication_intent", entityId: input.id, draftId: locked.draft.id,
      draftRevision: Number(latest?.revision || 1), text: locked.intent.text, accountId: locked.intent.accountId, action: "post", format: locked.draft.format,
      targetId, externalId: locked.draft.externalId, sourceHandle: locked.draft.sourceHandle, sourceUrl: locked.draft.sourceUrl, mediaHash: locked.intent.mediaHash,
      approvalSource: input.source || "human", approvedAt: input.now, expiresAt }).returning({ id: publicationApprovalSnapshots.id });
    const updated = await tx.update(publicationIntents).set({ status: "approved", approvedAt: input.now, approvalExpiresAt: expiresAt,
      approvalSnapshotId: snapshot.id, updatedAt: input.now }).where(and(eq(publicationIntents.id, input.id), eq(publicationIntents.status, "pending_approval"))).returning({ id: publicationIntents.id });
    if (!updated.length) throw new Error("publication approval changed concurrently");
    await tx.insert(publicationIntentEvents).values({ intentId: input.id, event: "approved", status: "approved", errorClass: "", createdAt: input.now });
    return updated.length > 0;
  });
  return approved ? getPostgresPublicationIntent(input.id) : null;
}

export async function createPostgresPublicationIntent(input: { draftId: number; accountId: number; idempotencyKey: string; text: string; mediaHash?: string; now: number }): Promise<PublicationIntent> {
  const ownerId = owner(), db = getPostgresDb();
  const [found] = await db.select({ draft: drafts, handle: accounts.handle }).from(drafts).innerJoin(accounts, and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, ownerId)))
    .where(and(eq(drafts.id, input.draftId), eq(drafts.ownerUserId, ownerId))).limit(1);
  if (!found || found.draft.accountId !== input.accountId || found.draft.format !== "post" || !input.text.trim()) throw new Error("publication intent için geçerli draft ve hesap gerekli");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ intent: publicationIntents }).from(publicationIntents).innerJoin(drafts, eq(drafts.id, publicationIntents.draftId))
      .where(and(eq(publicationIntents.idempotencyKey, input.idempotencyKey), eq(drafts.ownerUserId, ownerId))).limit(1);
    if (existing && !["cancelled", "expired"].includes(existing.intent.status)) return mapIntent(existing.intent, found.handle);
    const key = existing ? `${input.idempotencyKey}:retry:${crypto.randomUUID()}` : input.idempotencyKey;
    const [row] = await tx.insert(publicationIntents).values({ draftId: input.draftId, accountId: input.accountId, status: "pending_approval",
      idempotencyKey: key, text: input.text.slice(0, 280), mediaHash: input.mediaHash || "", requestedAt: input.now, updatedAt: input.now }).returning();
    await tx.update(drafts).set({ status: "pending_approval", updatedAt: input.now }).where(and(eq(drafts.id, input.draftId), eq(drafts.ownerUserId, ownerId)));
    await tx.insert(publicationIntentEvents).values({ intentId: row.id, event: "created", status: "pending_approval", errorClass: "", createdAt: input.now });
    return mapIntent(row, found.handle);
  });
}

export async function listPostgresQueueJobsSystem(limit = 500): Promise<AutomationJob[]> {
  const rows = await getPostgresDb().select({ job: automationJobs, handle: accounts.handle }).from(automationJobs)
    .innerJoin(drafts, eq(drafts.id, automationJobs.draftId)).leftJoin(accounts, eq(accounts.id, automationJobs.accountId))
    .orderBy(asc(automationJobs.scheduledAt), asc(automationJobs.id)).limit(Math.max(1, Math.min(1000, limit)));
  return rows.map(({ job, handle }) => mapJob(job, handle));
}

export async function getPostgresQueueJobSystem(id: number) {
  const [row] = await getPostgresDb().select({ job: automationJobs, ownerUserId: drafts.ownerUserId, handle: accounts.handle }).from(automationJobs)
    .innerJoin(drafts, eq(drafts.id, automationJobs.draftId)).leftJoin(accounts, eq(accounts.id, automationJobs.accountId))
    .where(eq(automationJobs.id, id)).limit(1);
  return row ? { job: mapJob(row.job, row.handle), ownerUserId: row.ownerUserId } : null;
}

export async function getPostgresPublicationIntentSystem(id: number) {
  const [row] = await getPostgresDb().select({ intent: publicationIntents, ownerUserId: drafts.ownerUserId, handle: accounts.handle }).from(publicationIntents)
    .innerJoin(drafts, eq(drafts.id, publicationIntents.draftId)).leftJoin(accounts, eq(accounts.id, publicationIntents.accountId))
    .where(eq(publicationIntents.id, id)).limit(1);
  return row ? { intent: mapIntent(row.intent, row.handle), ownerUserId: row.ownerUserId } : null;
}

export async function confirmPostgresAutomationJob(input: { id: number; ownerUserId: string; now: number; receipt: string; remoteUrl: string }): Promise<boolean> {
  return getPostgresDb().transaction(async (tx) => {
    const rows = await tx.update(automationJobs).set({ status: "confirmed", reconciliationStatus: "confirmed", receipt: input.receipt,
      remoteUrl: input.remoteUrl, reason: "authenticated remote evidence confirmed", updatedAt: input.now })
      .where(and(eq(automationJobs.id, input.id), or(eq(automationJobs.status, "pending_reconciliation"), eq(automationJobs.status, "reconciliation_required")),
        isNotNull(automationJobs.remoteWriteStartedAt), sql`EXISTS (SELECT 1 FROM ispatla_app.drafts d WHERE d.id = ${automationJobs.draftId} AND d.owner_user_id = ${input.ownerUserId})`))
      .returning({ id: automationJobs.id, draftId: automationJobs.draftId });
    if (!rows.length) return false;
    await tx.insert(automationJobEvents).values({ jobId: input.id, event: "confirmed", status: "confirmed", errorClass: "", createdAt: input.now });
    await tx.update(drafts).set({ status: "confirmed", updatedAt: input.now }).where(and(eq(drafts.id, rows[0].draftId), eq(drafts.ownerUserId, input.ownerUserId)));
    return true;
  });
}

export async function markPostgresAutomationReconciliationRequired(input: { id: number; ownerUserId: string; now: number; reason: string }): Promise<boolean> {
  const changed = await getPostgresDb().update(automationJobs).set({ status: "reconciliation_required", reconciliationStatus: "required", reason: input.reason, updatedAt: input.now })
    .where(and(eq(automationJobs.id, input.id), eq(automationJobs.status, "pending_reconciliation"), isNotNull(automationJobs.remoteWriteStartedAt),
      sql`EXISTS (SELECT 1 FROM ispatla_app.drafts d WHERE d.id = ${automationJobs.draftId} AND d.owner_user_id = ${input.ownerUserId})`)).returning({ id: automationJobs.id });
  if (changed.length) await getPostgresDb().insert(automationJobEvents).values({ jobId: input.id, event: "reconcile_started", status: "reconciliation_required", errorClass: "", createdAt: input.now });
  return changed.length > 0;
}

export async function confirmPostgresPublicationIntent(input: { id: number; ownerUserId: string; now: number; remotePostId: string; remoteUrl: string }): Promise<boolean> {
  return getPostgresDb().transaction(async (tx) => {
    const rows = await tx.update(publicationIntents).set({ status: "confirmed", confirmedAt: input.now, remotePostId: input.remotePostId,
      remoteUrl: input.remoteUrl, updatedAt: input.now })
      .where(and(eq(publicationIntents.id, input.id), eq(publicationIntents.status, "pending_reconciliation"), isNotNull(publicationIntents.remoteWriteStartedAt),
        sql`EXISTS (SELECT 1 FROM ispatla_app.drafts d WHERE d.id = ${publicationIntents.draftId} AND d.owner_user_id = ${input.ownerUserId})`))
      .returning({ id: publicationIntents.id, draftId: publicationIntents.draftId });
    if (!rows.length) return false;
    await tx.insert(publicationIntentEvents).values({ intentId: input.id, event: "confirmed", status: "confirmed", errorClass: "", createdAt: input.now });
    await tx.update(drafts).set({ status: "confirmed", updatedAt: input.now }).where(and(eq(drafts.id, rows[0].draftId), eq(drafts.ownerUserId, input.ownerUserId)));
    return true;
  });
}

export async function markPostgresPublicationReconciliationRequired(input: { id: number; ownerUserId: string; now: number; reason: string }): Promise<boolean> {
  const changed = await getPostgresDb().update(publicationIntents).set({ status: "reconciliation_required", reason: input.reason, updatedAt: input.now })
    .where(and(eq(publicationIntents.id, input.id), eq(publicationIntents.status, "pending_reconciliation"), isNotNull(publicationIntents.remoteWriteStartedAt),
      sql`EXISTS (SELECT 1 FROM ispatla_app.drafts d WHERE d.id = ${publicationIntents.draftId} AND d.owner_user_id = ${input.ownerUserId})`)).returning({ id: publicationIntents.id });
  if (changed.length) await getPostgresDb().insert(publicationIntentEvents).values({ intentId: input.id, event: "reconcile_started", status: "reconciliation_required", errorClass: "", createdAt: input.now });
  return changed.length > 0;
}

export async function listPostgresPublicationIntentsSystem(limit = 500, status?: string): Promise<PublicationIntent[]> {
  const rows = await getPostgresDb().select({ intent: publicationIntents, handle: accounts.handle }).from(publicationIntents)
    .innerJoin(drafts, eq(drafts.id, publicationIntents.draftId)).leftJoin(accounts, eq(accounts.id, publicationIntents.accountId))
    .where(status ? eq(publicationIntents.status, status) : undefined).orderBy(asc(publicationIntents.requestedAt), asc(publicationIntents.id))
    .limit(Math.max(1, Math.min(1000, limit)));
  return rows.map(({ intent, handle }) => mapIntent(intent, handle));
}

export async function getPostgresReconciliationIntentIds(limit = 20): Promise<number[]> {
  return (await getPostgresDb().select({ id: publicationIntents.id }).from(publicationIntents)
    .where(and(eq(publicationIntents.status, "pending_reconciliation"), isNotNull(publicationIntents.remoteWriteStartedAt)))
    .orderBy(asc(publicationIntents.updatedAt), asc(publicationIntents.id)).limit(Math.max(1, Math.min(100, limit)))).map((row) => row.id);
}
