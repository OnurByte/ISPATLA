import { bigint, bigserial, index, integer, pgSchema, text, unique } from "drizzle-orm/pg-core";
import { accounts, drafts } from "./postgres-schema";

const app = pgSchema("ispatla_app");

export const automationJobs = app.table("automation_jobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(), draftId: bigint("draft_id", { mode: "number" }).notNull().references(() => drafts.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).references(() => accounts.id, { onDelete: "cascade" }), action: text("action").notNull().default("post"),
  scheduledAt: bigint("scheduled_at", { mode: "number" }).notNull(), status: text("status").notNull().default("queued"), receipt: text("receipt").notNull().default(""),
  reason: text("reason").notNull().default(""), remoteUrl: text("remote_url").notNull().default(""), reconciliationStatus: text("reconciliation_status").notNull().default("not_started"),
  attempts: integer("attempts").notNull().default(0), createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  leaseToken: text("lease_token"), leaseUntil: bigint("lease_until", { mode: "number" }), heartbeatAt: bigint("heartbeat_at", { mode: "number" }),
  maxAttempts: integer("max_attempts").notNull().default(5), nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull().default(0),
  errorClass: text("error_class").notNull().default(""), deadLetteredAt: bigint("dead_lettered_at", { mode: "number" }),
  remoteWriteStartedAt: bigint("remote_write_started_at", { mode: "number" }), approvalExpiresAt: bigint("approval_expires_at", { mode: "number" }),
  approvalSnapshotId: bigint("approval_snapshot_id", { mode: "number" }),
}, (t) => [index("automation_jobs_status_idx").on(t.status, t.scheduledAt), index("automation_jobs_retry_idx").on(t.status, t.scheduledAt, t.nextAttemptAt), index("automation_jobs_lease_idx").on(t.status, t.leaseUntil)]);

export const publicationIntents = app.table("publication_intents", {
  id: bigserial("id", { mode: "number" }).primaryKey(), draftId: bigint("draft_id", { mode: "number" }).notNull().references(() => drafts.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }), status: text("status").notNull().default("pending_approval"),
  idempotencyKey: text("idempotency_key").notNull().unique(), text: text("text").notNull(), mediaPath: text("media_path").notNull().default(""), mediaHash: text("media_hash").notNull().default(""),
  receipt: text("receipt").notNull().default(""), remoteUrl: text("remote_url").notNull().default(""), reason: text("reason").notNull().default(""), requestedAt: bigint("requested_at", { mode: "number" }).notNull(),
  approvedAt: bigint("approved_at", { mode: "number" }), dispatchedAt: bigint("dispatched_at", { mode: "number" }), confirmedAt: bigint("confirmed_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(), attempts: integer("attempts").notNull().default(0), leaseToken: text("lease_token"), leaseUntil: bigint("lease_until", { mode: "number" }),
  heartbeatAt: bigint("heartbeat_at", { mode: "number" }), maxAttempts: integer("max_attempts").notNull().default(5), nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull().default(0),
  errorClass: text("error_class").notNull().default(""), deadLetteredAt: bigint("dead_lettered_at", { mode: "number" }), remoteWriteStartedAt: bigint("remote_write_started_at", { mode: "number" }),
  remotePostId: text("remote_post_id").notNull().default(""), approvalExpiresAt: bigint("approval_expires_at", { mode: "number" }), approvalSnapshotId: bigint("approval_snapshot_id", { mode: "number" }),
}, (t) => [index("publication_intents_status_idx").on(t.status, t.requestedAt), index("publication_intents_lease_idx").on(t.status, t.leaseUntil)]);

export const automationJobEvents = app.table("automation_job_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(), jobId: bigint("job_id", { mode: "number" }).notNull().references(() => automationJobs.id, { onDelete: "cascade" }),
  event: text("event").notNull(), status: text("status").notNull().default(""), errorClass: text("error_class").notNull().default(""), createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (t) => [index("automation_job_events_job_idx").on(t.jobId, t.id)]);
export const publicationIntentEvents = app.table("publication_intent_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(), intentId: bigint("intent_id", { mode: "number" }).notNull().references(() => publicationIntents.id, { onDelete: "cascade" }),
  event: text("event").notNull(), status: text("status").notNull().default(""), errorClass: text("error_class").notNull().default(""), createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (t) => [index("publication_intent_events_intent_idx").on(t.intentId, t.id)]);
export const accountDispatchLeases = app.table("account_dispatch_leases", {
  accountId: bigint("account_id", { mode: "number" }).primaryKey().references(() => accounts.id, { onDelete: "cascade" }), leaseToken: text("lease_token").notNull(),
  leaseUntil: bigint("lease_until", { mode: "number" }).notNull(), createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => [index("account_dispatch_leases_expiry_idx").on(t.leaseUntil)]);
export const publicationApprovalSnapshots = app.table("publication_approval_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(), entityType: text("entity_type").notNull(), entityId: bigint("entity_id", { mode: "number" }).notNull(),
  draftId: bigint("draft_id", { mode: "number" }).notNull().references(() => drafts.id, { onDelete: "cascade" }), draftRevision: integer("draft_revision").notNull(),
  text: text("text").notNull(), accountId: bigint("account_id", { mode: "number" }).references(() => accounts.id, { onDelete: "set null" }), action: text("action").notNull(),
  format: text("format").notNull(), targetId: text("target_id").notNull().default(""), externalId: text("external_id").notNull().default(""),
  sourceHandle: text("source_handle").notNull().default(""), sourceUrl: text("source_url").notNull().default(""), mediaHash: text("media_hash").notNull().default(""),
  approvalSource: text("approval_source").notNull(), approvedAt: bigint("approved_at", { mode: "number" }).notNull(), expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
}, (t) => [unique("publication_approval_snapshots_entity_unique").on(t.entityType, t.entityId)]);
export const publishAttempts = app.table("publish_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(), postExternalId: text("post_external_id").notNull(), accountId: bigint("account_id", { mode: "number" }),
  status: text("status").notNull(), reason: text("reason").notNull().default(""), receipt: text("receipt").notNull().default(""), remoteUrl: text("remote_url").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(0), occurrences: integer("occurrences").notNull().default(1),
  publicationIntentId: bigint("publication_intent_id", { mode: "number" }),
}, (t) => [index("publish_attempts_status_idx").on(t.status, t.createdAt)]);

export const postgresQueueSchema = { automationJobs, publicationIntents, automationJobEvents, publicationIntentEvents, accountDispatchLeases, publicationApprovalSnapshots, publishAttempts };
