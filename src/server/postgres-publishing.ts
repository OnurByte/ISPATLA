import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getPostgresSetting } from "./postgres-settings";
import { getPostgresDb } from "./postgres";
import { accounts, authUserStatus, drafts } from "./postgres-schema";
import {
  accountDispatchLeases, automationJobEvents, automationJobs, publicationApprovalSnapshots, publicationIntents, publicationIntentEvents,
} from "./postgres-queue-schema";

export async function publishingEnabled(): Promise<boolean> {
  if (process.env.ISPATLA_DEMO === "1" || process.env.ISPATLA_AUTOMATION === "0") return false;
  const [automationPaused, publishingPaused] = await Promise.all([
    getPostgresSetting("automation_paused", "0"),
    getPostgresSetting("publishing_paused", "0"),
  ]);
  return automationPaused !== "1" && publishingPaused !== "1";
}

export function retryDelaySeconds(attempts: number, options: { baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number } = {}): number {
  const base = Math.max(1, Math.min(3600, Math.floor(options.baseDelaySeconds ?? 30)));
  const maximum = Math.max(base, Math.min(86400, Math.floor(options.maxDelaySeconds ?? 3600)));
  const exponent = Math.max(0, Math.min(10, Math.floor(attempts) - 1));
  const ceiling = Math.min(maximum, base * 2 ** exponent);
  const random = options.random || Math.random;
  return Math.max(1, Math.min(maximum, Math.floor(ceiling * (0.5 + Math.max(0, Math.min(1, random())) * 0.5))));
}

export function mayRetryExpiredDispatch(input: { remoteWriteStartedAt: number | null; approvalValid: boolean; attempts: number; maxAttempts: number }): boolean {
  return input.remoteWriteStartedAt === null && input.approvalValid && input.attempts < input.maxAttempts;
}

/** Expired leases with a request-sent marker are quarantined; only pre-send jobs can return to the queue. */
export async function recoverExpiredPostgresAutomationJobs(now: number, options: { baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number } = {}): Promise<number> {
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const expired = await tx.select({ job: automationJobs, draft: drafts }).from(automationJobs).innerJoin(drafts, eq(drafts.id, automationJobs.draftId))
      .where(and(eq(automationJobs.status, "running"), isNotNull(automationJobs.leaseUntil), lte(automationJobs.leaseUntil, now)))
      .orderBy(asc(automationJobs.leaseUntil), asc(automationJobs.id)).for("update", { skipLocked: true });
    let recovered = 0;
    for (const { job, draft } of expired) {
      const remoteStarted = job.remoteWriteStartedAt !== null;
      const snapshot = job.approvalSnapshotId ? (await tx.select().from(publicationApprovalSnapshots)
        .where(and(eq(publicationApprovalSnapshots.id, job.approvalSnapshotId), eq(publicationApprovalSnapshots.entityType, "automation_job"),
          eq(publicationApprovalSnapshots.entityId, job.id), eq(publicationApprovalSnapshots.draftId, draft.id),
          eq(publicationApprovalSnapshots.text, draft.text), job.accountId === null ? isNull(publicationApprovalSnapshots.accountId) : eq(publicationApprovalSnapshots.accountId, job.accountId), eq(publicationApprovalSnapshots.action, job.action),
          eq(publicationApprovalSnapshots.format, draft.format), eq(publicationApprovalSnapshots.externalId, draft.externalId),
          eq(publicationApprovalSnapshots.sourceHandle, draft.sourceHandle), eq(publicationApprovalSnapshots.sourceUrl, draft.sourceUrl),
          gtNow(publicationApprovalSnapshots.expiresAt, now))).limit(1))[0] : undefined;
      const expiredApproval = job.approvalExpiresAt === null || job.approvalExpiresAt <= now || !snapshot;
      const dead = job.attempts >= job.maxAttempts;
      const canRetry = mayRetryExpiredDispatch({ remoteWriteStartedAt: job.remoteWriteStartedAt, approvalValid: !expiredApproval, attempts: job.attempts, maxAttempts: job.maxAttempts });
      const status = remoteStarted ? "reconciliation_required" : canRetry ? "queued" : dead ? "dead_letter" : "expired";
      const errorClass = remoteStarted ? "unknown_remote_state" : expiredApproval ? "approval_expired_or_changed" : dead ? "max_attempts" : "lease_expired";
      const event = remoteStarted ? "reconcile_started" : status === "queued" ? "retry_scheduled" : status;
      const update = await tx.update(automationJobs).set({ status, reason: errorClass, errorClass,
        reconciliationStatus: remoteStarted ? "required" : job.reconciliationStatus,
        nextAttemptAt: status === "queued" ? now + retryDelaySeconds(job.attempts, options) : 0,
        deadLetteredAt: status === "dead_letter" ? now : null, leaseToken: null, leaseUntil: null, updatedAt: now,
      }).where(and(eq(automationJobs.id, job.id), eq(automationJobs.status, "running"), lte(automationJobs.leaseUntil, now))).returning({ id: automationJobs.id });
      if (!update.length) continue;
      await tx.insert(automationJobEvents).values({ jobId: job.id, event, status, errorClass, createdAt: now });
      if (status === "expired") await tx.update(drafts).set({ status: "ready", updatedAt: now }).where(eq(drafts.id, draft.id));
      recovered++;
    }
    return recovered;
  });
}

export async function recoverOrphanedPostgresAutomationJobs(now: number, cutoff: number): Promise<number> {
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select({ job: automationJobs }).from(automationJobs)
      .where(and(eq(automationJobs.status, "running"), isNull(automationJobs.leaseToken), lte(automationJobs.updatedAt, cutoff)))
      .orderBy(asc(automationJobs.updatedAt), asc(automationJobs.id)).for("update", { skipLocked: true });
    let count = 0;
    for (const { job } of rows) {
      // A tokenless stale runner has no trustworthy fence history; quarantine it even when the marker is absent.
      const changed = await tx.update(automationJobs).set({ status: "reconciliation_required", reconciliationStatus: "required",
        reason: "stale dispatch without a lease; manual reconciliation required", errorClass: job.remoteWriteStartedAt === null ? "stale_legacy_dispatch" : "unknown_remote_state",
        updatedAt: now, leaseUntil: null,
      }).where(and(eq(automationJobs.id, job.id), eq(automationJobs.status, "running"), isNull(automationJobs.leaseToken), lte(automationJobs.updatedAt, cutoff))).returning({ id: automationJobs.id });
      if (!changed.length) continue;
      await tx.insert(automationJobEvents).values({ jobId: job.id, event: "reconcile_started", status: "reconciliation_required",
        errorClass: job.remoteWriteStartedAt === null ? "stale_legacy_dispatch" : "unknown_remote_state", createdAt: now });
      count++;
    }
    return count;
  });
}

/** Publication intent recovery never retries after the once-only remote-write marker. */
export async function recoverExpiredPostgresPublicationIntents(now: number, options: { baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number } = {}): Promise<number> {
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const expired = await tx.select({ intent: publicationIntents, draft: drafts }).from(publicationIntents).innerJoin(drafts, eq(drafts.id, publicationIntents.draftId))
      .where(and(eq(publicationIntents.status, "dispatching"), isNotNull(publicationIntents.leaseUntil), lte(publicationIntents.leaseUntil, now)))
      .orderBy(asc(publicationIntents.leaseUntil), asc(publicationIntents.id)).for("update", { skipLocked: true });
    let recovered = 0;
    for (const { intent, draft } of expired) {
      const remoteStarted = intent.remoteWriteStartedAt !== null;
      const snapshot = intent.approvalSnapshotId ? (await tx.select().from(publicationApprovalSnapshots)
        .where(and(eq(publicationApprovalSnapshots.id, intent.approvalSnapshotId), eq(publicationApprovalSnapshots.entityType, "publication_intent"),
          eq(publicationApprovalSnapshots.entityId, intent.id), eq(publicationApprovalSnapshots.draftId, draft.id),
          eq(publicationApprovalSnapshots.text, intent.text), eq(publicationApprovalSnapshots.text, draft.text),
          eq(publicationApprovalSnapshots.accountId, intent.accountId), eq(publicationApprovalSnapshots.action, "post"), eq(publicationApprovalSnapshots.format, draft.format),
          eq(publicationApprovalSnapshots.externalId, draft.externalId), eq(publicationApprovalSnapshots.sourceHandle, draft.sourceHandle),
          eq(publicationApprovalSnapshots.sourceUrl, draft.sourceUrl), eq(publicationApprovalSnapshots.mediaHash, intent.mediaHash),
          gtNow(publicationApprovalSnapshots.expiresAt, now))).limit(1))[0] : undefined;
      const expiredApproval = intent.approvalExpiresAt === null || intent.approvalExpiresAt <= now || !snapshot;
      const dead = intent.attempts >= intent.maxAttempts;
      const canRetry = mayRetryExpiredDispatch({ remoteWriteStartedAt: intent.remoteWriteStartedAt, approvalValid: !expiredApproval, attempts: intent.attempts, maxAttempts: intent.maxAttempts });
      const status = remoteStarted ? "reconciliation_required" : canRetry ? "approved" : dead ? "dead_letter" : "expired";
      const errorClass = remoteStarted ? "unknown_remote_state" : expiredApproval ? "approval_expired_or_changed" : dead ? "max_attempts" : "lease_expired";
      const event = remoteStarted ? "reconcile_started" : status === "approved" ? "retry_scheduled" : status;
      const update = await tx.update(publicationIntents).set({ status, reason: errorClass, errorClass,
        nextAttemptAt: status === "approved" ? now + retryDelaySeconds(intent.attempts, options) : 0,
        deadLetteredAt: status === "dead_letter" ? now : null, leaseToken: null, leaseUntil: null, updatedAt: now,
      }).where(and(eq(publicationIntents.id, intent.id), eq(publicationIntents.status, "dispatching"), lte(publicationIntents.leaseUntil, now))).returning({ id: publicationIntents.id });
      if (!update.length) continue;
      await tx.insert(publicationIntentEvents).values({ intentId: intent.id, event, status, errorClass, createdAt: now });
      if (status === "expired") await tx.update(drafts).set({ status: "ready", updatedAt: now }).where(eq(drafts.id, draft.id));
      recovered++;
    }
    return recovered;
  });
}

/** A worker may have crashed between setting dispatching and acquiring its lease. */
export async function recoverOrphanedPostgresDispatches(now: number, cutoff: number): Promise<number> {
  const db = getPostgresDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select({ intent: publicationIntents, draft: drafts }).from(publicationIntents).innerJoin(drafts, eq(drafts.id, publicationIntents.draftId))
      .where(and(eq(publicationIntents.status, "dispatching"), isNull(publicationIntents.leaseToken), lte(publicationIntents.updatedAt, cutoff)))
      .orderBy(asc(publicationIntents.updatedAt), asc(publicationIntents.id)).for("update", { skipLocked: true });
    let count = 0;
    for (const { intent, draft } of rows) {
      const markerSet = intent.remoteWriteStartedAt !== null;
      const snapshot = intent.approvalSnapshotId ? (await tx.select().from(publicationApprovalSnapshots)
        .where(and(eq(publicationApprovalSnapshots.id, intent.approvalSnapshotId), eq(publicationApprovalSnapshots.entityType, "publication_intent"),
          eq(publicationApprovalSnapshots.entityId, intent.id), eq(publicationApprovalSnapshots.draftId, draft.id),
          eq(publicationApprovalSnapshots.text, intent.text), eq(publicationApprovalSnapshots.text, draft.text), eq(publicationApprovalSnapshots.accountId, intent.accountId),
          eq(publicationApprovalSnapshots.action, "post"), eq(publicationApprovalSnapshots.format, draft.format), eq(publicationApprovalSnapshots.externalId, draft.externalId),
          eq(publicationApprovalSnapshots.sourceHandle, draft.sourceHandle), eq(publicationApprovalSnapshots.sourceUrl, draft.sourceUrl),
          eq(publicationApprovalSnapshots.mediaHash, intent.mediaHash), gtNow(publicationApprovalSnapshots.expiresAt, now))).limit(1))[0] : undefined;
      const approvalValid = intent.approvalExpiresAt !== null && intent.approvalExpiresAt > now && Boolean(snapshot);
      const canRetry = mayRetryExpiredDispatch({ remoteWriteStartedAt: intent.remoteWriteStartedAt, approvalValid, attempts: intent.attempts, maxAttempts: intent.maxAttempts });
      const status = markerSet ? "reconciliation_required" : canRetry ? "approved" : intent.attempts >= intent.maxAttempts ? "dead_letter" : "expired";
      const errorClass = markerSet ? "unknown_remote_state" : approvalValid ? "stale_dispatch_before_send" : "approval_expired_or_changed";
      const changed = await tx.update(publicationIntents).set({ status, reason: errorClass, errorClass, updatedAt: now,
        nextAttemptAt: status === "approved" ? now : 0, deadLetteredAt: status === "dead_letter" ? now : null,
      }).where(and(eq(publicationIntents.id, intent.id), eq(publicationIntents.status, "dispatching"), isNull(publicationIntents.leaseToken), lte(publicationIntents.updatedAt, cutoff)))
        .returning({ id: publicationIntents.id });
      if (!changed.length) continue;
      await tx.insert(publicationIntentEvents).values({ intentId: intent.id, event: markerSet ? "reconcile_started" : status, status, errorClass, createdAt: now });
      if (status === "expired") await tx.update(drafts).set({ status: "ready", updatedAt: now }).where(eq(drafts.id, draft.id));
      count++;
    }
    return count;
  });
}

function gtNow(column: typeof publicationApprovalSnapshots.expiresAt, now: number) { return sql`${column} > ${now}`; }

export async function isPostgresOwnerEnabled(ownerUserId: string): Promise<boolean> {
  const [row] = await getPostgresDb().select({ status: authUserStatus.status }).from(authUserStatus).where(eq(authUserStatus.ownerUserId, ownerUserId)).limit(1);
  return row?.status !== "disabled";
}

export async function claimPostgresAccountDispatchLease(input: { accountId: number; ownerUserId: string; now: number; leaseSeconds?: number }) {
  const seconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const [account] = await getPostgresDb().select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, input.ownerUserId), eq(accounts.enabled, true))).limit(1);
  if (!account) return null;
  const token = randomUUID(), leaseUntil = input.now + seconds;
  const [row] = await getPostgresDb().insert(accountDispatchLeases).values({ accountId: input.accountId, leaseToken: token, leaseUntil, createdAt: input.now, updatedAt: input.now })
    .onConflictDoUpdate({ target: accountDispatchLeases.accountId,
      set: { leaseToken: token, leaseUntil, updatedAt: input.now }, setWhere: lte(accountDispatchLeases.leaseUntil, input.now) }).returning();
  return row ? { accountId: row.accountId, leaseToken: row.leaseToken, leaseUntil: row.leaseUntil } : null;
}

export async function isPostgresAccountDispatchLeaseCurrent(input: { accountId: number; ownerUserId: string; leaseToken: string; now: number }): Promise<boolean> {
  const [row] = await getPostgresDb().select({ accountId: accountDispatchLeases.accountId }).from(accountDispatchLeases)
    .innerJoin(accounts, eq(accounts.id, accountDispatchLeases.accountId))
    .where(and(eq(accountDispatchLeases.accountId, input.accountId), eq(accountDispatchLeases.leaseToken, input.leaseToken),
      sql`${accountDispatchLeases.leaseUntil} > ${input.now}`, eq(accounts.ownerUserId, input.ownerUserId), eq(accounts.enabled, true))).limit(1);
  return Boolean(row);
}

export async function renewPostgresAccountDispatchLease(input: { accountId: number; ownerUserId: string; leaseToken: string; now: number; leaseSeconds?: number }): Promise<boolean> {
  const seconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const rows = await getPostgresDb().update(accountDispatchLeases).set({ leaseUntil: input.now + seconds, updatedAt: input.now })
    .where(and(eq(accountDispatchLeases.accountId, input.accountId), eq(accountDispatchLeases.leaseToken, input.leaseToken),
      sql`${accountDispatchLeases.leaseUntil} > ${input.now}`, sql`EXISTS (SELECT 1 FROM ispatla_app.accounts a WHERE a.id = ${accountDispatchLeases.accountId} AND a.owner_user_id = ${input.ownerUserId} AND a.enabled = true)`))
    .returning({ accountId: accountDispatchLeases.accountId });
  return rows.length > 0;
}

export async function releasePostgresAccountDispatchLease(input: { accountId: number; ownerUserId: string; leaseToken: string; now: number }): Promise<boolean> {
  const rows = await getPostgresDb().update(accountDispatchLeases).set({ leaseToken: randomUUID(), leaseUntil: input.now, updatedAt: input.now })
    .where(and(eq(accountDispatchLeases.accountId, input.accountId), eq(accountDispatchLeases.leaseToken, input.leaseToken),
      sql`${accountDispatchLeases.leaseUntil} > ${input.now}`, sql`EXISTS (SELECT 1 FROM ispatla_app.accounts a WHERE a.id = ${accountDispatchLeases.accountId} AND a.owner_user_id = ${input.ownerUserId})`))
    .returning({ accountId: accountDispatchLeases.accountId });
  return rows.length > 0;
}

export async function getPostgresApprovedIntentIds(limit = 10) {
  return (await getPostgresDb().select({ id: publicationIntents.id }).from(publicationIntents)
    .where(and(eq(publicationIntents.status, "approved"), lte(publicationIntents.nextAttemptAt, Math.floor(Date.now() / 1000))))
    .orderBy(asc(publicationIntents.requestedAt), asc(publicationIntents.id)).limit(Math.max(1, Math.min(50, limit)))).map((row) => row.id);
}
