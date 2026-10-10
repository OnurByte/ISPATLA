import { bigint, bigserial, boolean, date, doublePrecision, foreignKey, index, integer, pgSchema, primaryKey, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const auth = pgSchema("ispatla_auth");
const app = pgSchema("ispatla_app");

// Mirrors the Better Auth tables from 20261010000000_ispatla_auth.sql.
export const authUser = auth.table("user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false), image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});
export const authSession = auth.table("session", {
  id: text("id").primaryKey(), expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(), createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(), ipAddress: text("ipAddress"),
  userAgent: text("userAgent"), userId: text("userId").notNull().references(() => authUser.id, { onDelete: "cascade" }),
});
export const authAccount = auth.table("account", {
  id: text("id").primaryKey(), accountId: text("accountId").notNull(), providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => authUser.id, { onDelete: "cascade" }), accessToken: text("accessToken"),
  refreshToken: text("refreshToken"), idToken: text("idToken"), accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }), scope: text("scope"), password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});
export const authVerification = auth.table("verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(), createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});
export const authRateLimit = auth.table("rateLimit", {
  id: text("id").primaryKey(), key: text("key").notNull().unique(), count: integer("count").notNull(),
  lastRequest: bigint("lastRequest", { mode: "number" }).notNull(),
});
export const authEmailVerificationTokens = auth.table("auth_email_verification_tokens", {
  tokenHash: text("token_hash").primaryKey(), userId: text("user_id").notNull(), expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});
export const authSignupAdmission = auth.table("auth_signup_admission", {
  key: text("key").primaryKey(), count: integer("count").notNull(), windowStartedAt: bigint("window_started_at", { mode: "number" }).notNull(),
});
export const authUserStatus = auth.table("auth_user_status", {
  ownerUserId: text("owner_user_id").primaryKey(), status: text("status").notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export const authAbuseSignupSignals = auth.table("auth_abuse_signup_signals", {
  id: text("id").primaryKey(), ownerUserId: text("owner_user_id"), emailHash: text("email_hash"), deviceHash: text("device_hash"),
  ipHash: text("ip_hash"), createdAt: bigint("created_at", { mode: "number" }).notNull(), outcome: text("outcome").notNull().default("pending"),
  risk: text("risk").notNull(),
});

export const userProfiles = app.table("user_profiles", {
  ownerUserId: text("owner_user_id").primaryKey().references(() => authUser.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(), displayName: text("display_name").notNull().default(""),
  bio: text("bio").notNull().default(""), visibility: text("visibility").notNull().default("private"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  xHandle: text("x_handle"), avatarUrl: text("avatar_url"), onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
});
export const accounts = app.table("accounts", {
  id: bigserial("id", { mode: "number" }).primaryKey(), accountKey: text("account_key").notNull().unique(),
  ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().unique(), displayName: text("display_name").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true), defaultAccount: boolean("default_account").notNull().default(false),
  automationMode: text("automation_mode").notNull().default("manual"), dailyLimit: integer("daily_limit").notNull().default(24),
  capabilitiesJson: text("capabilities_json").notNull().default("[]"), styleProfileJson: text("style_profile_json").notNull().default("{}"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [unique("accounts_owner_id_unique").on(table.ownerUserId, table.id)]);
export const drafts = app.table("drafts", {
  id: bigserial("id", { mode: "number" }).primaryKey(), batchId: text("batch_id").notNull().default(""), origin: text("origin").notNull().default("manual"),
  prompt: text("prompt").notNull().default(""), provider: text("provider").notNull().default(""), model: text("model").notNull().default(""),
  variantMode: text("variant_mode").notNull().default("same_text"), sourceHandle: text("source_handle").notNull().default(""), sourceUrl: text("source_url").notNull().default(""),
  sourceScore: doublePrecision("source_score").notNull().default(0), externalId: text("external_id").notNull().default(""),
  accountId: bigint("account_id", { mode: "number" }).references(() => accounts.id, { onDelete: "cascade" }),
  format: text("format").notNull().default("post"), text: text("text").notNull().default(""), status: text("status").notNull().default("draft"),
  gateReason: text("gate_reason").notNull().default(""), createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
});
export const draftRevisions = app.table("draft_revisions", {
  id: bigserial("id", { mode: "number" }).primaryKey(), draftId: bigint("draft_id", { mode: "number" }).notNull().references(() => drafts.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }), revision: integer("revision").notNull(),
  accountId: bigint("account_id", { mode: "number" }), format: text("format").notNull(), text: text("text").notNull(), externalId: text("external_id").notNull().default(""),
  sourceHandle: text("source_handle").notNull().default(""), sourceUrl: text("source_url").notNull().default(""), createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [unique("draft_revisions_draft_revision_unique").on(table.draftId, table.revision), index("draft_revisions_owner_idx").on(table.ownerUserId, table.draftId, table.revision)]);
export const draftEvaluations = app.table("draft_evaluations", {
  id: bigserial("id", { mode: "number" }).primaryKey(), draftId: bigint("draft_id", { mode: "number" }).notNull().references(() => drafts.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }), categorySlug: text("category_slug").notNull().default(""), mode: text("mode").notNull().default("shadow_cold_start"),
  score: doublePrecision("score").notNull().default(0), confidence: doublePrecision("confidence").notNull().default(0), predictedResidual: doublePrecision("predicted_residual"),
  baselineScope: text("baseline_scope").notNull().default("none"), baselineSamples: integer("baseline_samples").notNull().default(0), baselineViews: doublePrecision("baseline_views"),
  baselineReplies: doublePrecision("baseline_replies"), predictedViews: doublePrecision("predicted_views"), helpedJson: text("helped_json").notNull().default("[]"),
  hurtJson: text("hurt_json").notNull().default("[]"), createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [unique("draft_evaluations_draft_id_unique").on(table.draftId)]);
export const categories = app.table("categories", {
  id: bigserial("id", { mode: "number" }).primaryKey(), slug: text("slug").notNull().unique(), name: text("name").notNull(),
  enabled: smallint("enabled").notNull().default(1), builtIn: smallint("built_in").notNull().default(0),
  baseStrategy: text("base_strategy").notNull(), clusterStrategy: text("cluster_strategy").notNull(), verificationMode: text("verification_mode").notNull(),
  description: text("description").notNull().default(""), positiveExamplesJson: text("positive_examples_json").notNull().default("[]"),
  negativeExamplesJson: text("negative_examples_json").notNull().default("[]"), keywordsJson: text("keywords_json").notNull().default("[]"),
  excludedKeywordsJson: text("excluded_keywords_json").notNull().default("[]"), seedHandlesJson: text("seed_handles_json").notNull().default("[]"),
  defaultFormatsJson: text("default_formats_json").notNull().default('["post"]'), sourcePolicyJson: text("source_policy_json").notNull().default("{}"),
  riskPolicyJson: text("risk_policy_json").notNull().default("{}"), scoringPolicyJson: text("scoring_policy_json").notNull().default("{}"),
  publishingPolicyJson: text("publishing_policy_json").notNull().default("{}"), aiContext: text("ai_context").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  ownerUserId: text("owner_user_id").references(() => authUser.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).references(() => accounts.id, { onDelete: "cascade" }),
});
export const accountCategories = app.table("account_categories", {
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  categoryId: bigint("category_id", { mode: "number" }).notNull().references(() => categories.id, { onDelete: "cascade" }),
  enabled: smallint("enabled").notNull().default(1), isPrimary: smallint("is_primary").notNull().default(0),
  weight: doublePrecision("weight").notNull().default(1), priority: integer("priority").notNull().default(0),
  publishThreshold: doublePrecision("publish_threshold"), dailyBudget: integer("daily_budget"),
  styleOverrideJson: text("style_override_json").notNull().default("{}"), aiRouteOverrideJson: text("ai_route_override_json").notNull().default("{}"),
  source: text("source").notNull().default("manual"), userModifiedAt: bigint("user_modified_at", { mode: "number" }),
}, (table) => [primaryKey({ columns: [table.accountId, table.categoryId] })]);
export const xOAuthTransactions = app.table("x_oauth_transactions", {
  id: uuid("id").primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  sessionHash: text("session_hash").notNull(), stateHash: text("state_hash").notNull().unique(),
  encryptedCodeVerifier: text("encrypted_code_verifier").notNull(), requestedScopes: text("requested_scopes").array().notNull(),
  returnTo: text("return_to").notNull(), expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  consumedAt: bigint("consumed_at", { mode: "number" }), createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export const xOAuthAccounts = app.table("x_oauth_accounts", {
  xUserId: text("x_user_id").primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
  handle: text("handle").notNull(), displayName: text("display_name").notNull().default(""), authState: text("auth_state").notNull().default("connected"),
  connectedAt: bigint("connected_at", { mode: "number" }).notNull(), lastHealthAt: bigint("last_health_at", { mode: "number" }).notNull(),
  lastAuthError: text("last_auth_error").notNull().default(""),
}, (table) => [foreignKey({ columns: [table.ownerUserId, table.accountId], foreignColumns: [accounts.ownerUserId, accounts.id] }).onDelete("cascade")]);
export const xOAuthCredentials = app.table("x_oauth_credentials", {
  accountId: bigint("account_id", { mode: "number" }).primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  encryptedAccessToken: text("encrypted_access_token").notNull(), encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  encryptionKeyId: text("encryption_key_id").notNull(), accessExpiresAt: bigint("access_expires_at", { mode: "number" }).notNull(),
  scopes: text("scopes").array().notNull(), tokenVersion: bigint("token_version", { mode: "number" }).notNull().default(1),
  refreshedAt: bigint("refreshed_at", { mode: "number" }).notNull(), revokedAt: bigint("revoked_at", { mode: "number" }),
  refreshLeaseId: uuid("refresh_lease_id"), refreshLeaseUntil: bigint("refresh_lease_until", { mode: "number" }).notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [foreignKey({ columns: [table.ownerUserId, table.accountId], foreignColumns: [accounts.ownerUserId, accounts.id] }).onDelete("cascade")]);
export const automationConsents = app.table("automation_consents", {
  id: bigserial("id", { mode: "number" }).primaryKey(), accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }), actionType: text("action_type").notNull(),
  mode: text("mode").notNull().default("shadow"), policyVersion: text("policy_version").notNull(), consentCopyVersion: text("consent_copy_version").notNull(),
  dailyLimit: integer("daily_limit").notNull().default(0), cadenceSeconds: integer("cadence_seconds").notNull().default(0), version: integer("version").notNull().default(1),
  grantedAt: bigint("granted_at", { mode: "number" }), revokedAt: bigint("revoked_at", { mode: "number" }), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  unique("automation_consents_account_action_unique").on(table.accountId, table.actionType),
  foreignKey({ columns: [table.ownerUserId, table.accountId], foreignColumns: [accounts.ownerUserId, accounts.id] }).onDelete("cascade"),
]);
export const userProfileXIdentity = app.table("user_profile_x_identity", {
  ownerUserId: text("owner_user_id").primaryKey().references(() => userProfiles.ownerUserId, { onDelete: "cascade" }),
  xUserId: text("x_user_id").notNull().unique(),
});
export const landingEventDaily = app.table("landing_event_daily", {
  day: date("day", { mode: "string" }).notNull(), event: text("event").notNull(), page: text("page").notNull(),
  bucket: text("bucket").notNull().default(""), source: text("source").notNull().default("direct"),
  count: integer("count").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.day, table.event, table.page, table.bucket, table.source] }),
]);
export const xPolicyKillControls = app.table("x_policy_kill_controls", {
  ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), value: text("value").notNull(), enabled: boolean("enabled").notNull(),
  version: integer("version").notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [primaryKey({ columns: [table.ownerUserId, table.scope, table.value] })]);
export const xPolicyKillAudit = app.table("x_policy_kill_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), value: text("value").notNull(), previousEnabled: boolean("previous_enabled"), enabled: boolean("enabled").notNull(),
  previousVersion: integer("previous_version").notNull(), version: integer("version").notNull(), reason: text("reason").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [index("x_policy_kill_audit_owner_idx").on(table.ownerUserId, table.id)]);
export const xReplySummonAudits = app.table("x_reply_summon_audits", {
  id: uuid("id").primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  connectedXUserId: text("connected_x_user_id").notNull(), targetId: text("target_id").notNull(), authorXUserId: text("author_x_user_id").notNull(),
  kind: text("kind").notNull(), observedAt: bigint("observed_at", { mode: "number" }).notNull(), source: text("source").notNull(),
}, (table) => [unique("x_reply_summon_owner_target_unique").on(table.ownerUserId, table.accountId, table.targetId),
  index("x_reply_summon_owner_target_idx").on(table.ownerUserId, table.accountId, table.targetId, table.observedAt)]);

export const appSettings = app.table("app_settings", {
  name: text("name").primaryKey(), value: text("value").notNull().default(""), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export const secrets = app.table("secrets", {
  name: text("name").primaryKey(), provider: text("provider").notNull().default(""), ciphertext: text("ciphertext").notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export const usageEvents = app.table("usage_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(), kind: text("kind").notNull(), provider: text("provider").notNull().default(""), model: text("model").notNull().default(""),
  units: integer("units").notNull().default(1), estimatedUsd: doublePrecision("estimated_usd").notNull().default(0), metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(), ownerUserId: text("owner_user_id").references(() => authUser.id, { onDelete: "cascade" }),
  estimatedCostUsd: doublePrecision("estimated_cost_usd"), reportedCostUsd: doublePrecision("reported_cost_usd"), costBasis: text("cost_basis").notNull().default("unknown"),
  inputTokens: bigint("input_tokens", { mode: "number" }), outputTokens: bigint("output_tokens", { mode: "number" }), reservationId: text("reservation_id"),
});
export const aiBudgetReservations = app.table("ai_budget_reservations", {
  id: text("id").primaryKey(), ownerUserId: text("owner_user_id").references(() => authUser.id, { onDelete: "cascade" }),
  task: text("task").notNull(), provider: text("provider").notNull(), model: text("model").notNull(), reservedUsd: doublePrecision("reserved_usd"),
  status: text("status").notNull(), createdAt: bigint("created_at", { mode: "number" }).notNull(), settledAt: bigint("settled_at", { mode: "number" }),
});
export const automationLogs = app.table("automation_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(), taskId: text("task_id").notNull(), status: text("status").notNull(),
  startedAt: bigint("started_at", { mode: "number" }).notNull(), finishedAt: bigint("finished_at", { mode: "number" }),
  message: text("message").notNull().default(""), detailsJson: text("details_json").notNull().default("{}"),
});
export const accountCategoryInferenceJobs = app.table("account_category_inference_jobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), status: text("status").notNull(), resultJson: text("result_json"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [unique("account_category_inference_jobs_owner_account_version_unique").on(table.ownerUserId, table.accountId, table.version)]);
export const accountCategoryInferences = app.table("account_category_inferences", {
  id: bigserial("id", { mode: "number" }).primaryKey(), jobId: bigint("job_id", { mode: "number" }).notNull().references(() => accountCategoryInferenceJobs.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  categoryId: bigint("category_id", { mode: "number" }).notNull().references(() => categories.id, { onDelete: "cascade" }),
  confidence: doublePrecision("confidence").notNull(), evidenceJson: text("evidence_json").notNull(), modelId: text("model_id").notNull().default("deterministic-keyword-v1"),
  promptVersion: text("prompt_version").notNull().default("none"), inferenceVersion: integer("inference_version").notNull(),
  suggestedAt: bigint("suggested_at", { mode: "number" }).notNull(), acceptedAt: bigint("accepted_at", { mode: "number" }), rejectedAt: bigint("rejected_at", { mode: "number" }),
}, (table) => [unique("account_category_inferences_job_category_unique").on(table.jobId, table.categoryId),
  index("account_category_inferences_owner_idx").on(table.ownerUserId, table.accountId, table.jobId)]);


// Drizzle schema for the Supabase PostgreSQL application tables.
export const postgresSchema = {
  authUser, authSession, authAccount, authVerification, authRateLimit,
  authEmailVerificationTokens, authSignupAdmission, authUserStatus, authAbuseSignupSignals,
  userProfiles, accounts, drafts, draftRevisions, categories, accountCategories,
  xOAuthTransactions, xOAuthAccounts, xOAuthCredentials, automationConsents,
  userProfileXIdentity, landingEventDaily, xPolicyKillControls, xPolicyKillAudit, xReplySummonAudits,
  appSettings, secrets, usageEvents, aiBudgetReservations, automationLogs, accountCategoryInferenceJobs, accountCategoryInferences,
};
