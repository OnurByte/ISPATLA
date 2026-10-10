import { bigint, bigserial, doublePrecision, index, integer, pgSchema, primaryKey, text, unique } from "drizzle-orm/pg-core";

const app = pgSchema("ispatla_app");
export const evaluationPredictions = app.table("evaluation_predictions", {
  id:text("id").primaryKey(), ownerUserId:text("owner_user_id").notNull(), accountId:text("account_id").notNull(), candidateId:text("candidate_id").notNull(),
  leakageGroup:text("leakage_group").notNull(), modelKey:text("model_key").notNull(), rawScore:doublePrecision("raw_score").notNull(), split:text("split").notNull(),
  selectorVersion:text("selector_version").notNull(), selectionPropensity:doublePrecision("selection_propensity"), action:text("action").notNull(), category:text("category").notNull(),
  format:text("format").notNull(), riskTier:text("risk_tier").notNull(), featuresJson:text("features_json").notNull(), createdAt:bigint("created_at",{mode:"number"}).notNull(), resolveBy:bigint("resolve_by",{mode:"number"}).notNull(),
}, t=>[unique("evaluation_prediction_owner_candidate_unique").on(t.ownerUserId,t.accountId,t.candidateId,t.modelKey),index("evaluation_due_idx").on(t.ownerUserId,t.resolveBy,t.split)]);
export const evaluationOutcomeRevisions=app.table("evaluation_outcome_revisions",{
  id:bigserial("id",{mode:"number"}).primaryKey(),ownerUserId:text("owner_user_id").notNull(),predictionId:text("prediction_id").notNull(),capturedAt:bigint("captured_at",{mode:"number"}).notNull(),observedAt:bigint("observed_at",{mode:"number"}).notNull(),
  views:doublePrecision("views"),likes:doublePrecision("likes"),replies:doublePrecision("replies"),reposts:doublePrecision("reposts"),quotes:doublePrecision("quotes"),censoredJson:text("censored_json").notNull(),source:text("source").notNull(),provenanceRef:text("provenance_ref").notNull(),
  followersCount:bigint("followers_count",{mode:"number"}),followersObservedAt:bigint("followers_observed_at",{mode:"number"}),followersXUserId:text("followers_x_user_id"),followersProvenanceRef:text("followers_provenance_ref"),
},t=>[index("evaluation_outcome_idx").on(t.ownerUserId,t.predictionId,t.capturedAt)]);
export const evaluationLabels=app.table("evaluation_labels",{
  id:bigserial("id",{mode:"number"}).primaryKey(),ownerUserId:text("owner_user_id").notNull(),predictionId:text("prediction_id").notNull(),label:text("label").notNull(),reviewerRef:text("reviewer_ref").notNull(),labeledAt:bigint("labeled_at",{mode:"number"}).notNull(),
},t=>[unique("evaluation_labels_owner_prediction_unique").on(t.ownerUserId,t.predictionId)]);
export const evaluationReplays=app.table("evaluation_replays",{
  id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),accountId:text("account_id").notNull(),modelKey:text("model_key").notNull(),datasetHash:text("dataset_hash").notNull(),split:text("split").notNull(),sampleCount:integer("sample_count").notNull(),brier:doublePrecision("brier"),logLoss:doublePrecision("log_loss"),ece:doublePrecision("ece"),reliabilityJson:text("reliability_json").notNull(),createdAt:bigint("created_at",{mode:"number"}).notNull(),
},t=>[index("evaluation_replay_idx").on(t.ownerUserId,t.accountId,t.createdAt)]);
export const autonomySuggestions=app.table("autonomy_suggestions",{
  id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),accountId:text("account_id").notNull(),action:text("action").notNull(),category:text("category").notNull(),riskTier:text("risk_tier").notNull(),
  cleanApprovals:integer("clean_approvals").notNull(),policyFailures:integer("policy_failures").notNull(),authFailures:integer("auth_failures").notNull(),duplicateIncidents:integer("duplicate_incidents").notNull(),unacceptableOutcomes:integer("unacceptable_outcomes").notNull(),evidenceHash:text("evidence_hash").notNull(),status:text("status").notNull(),createdAt:bigint("created_at",{mode:"number"}).notNull(),decidedAt:bigint("decided_at",{mode:"number"}),modelKey:text("model_key"),selectorVersion:text("selector_version"),
});
export const scopedAutonomy=app.table("scoped_autonomy",{
  ownerUserId:text("owner_user_id").notNull(),accountId:text("account_id").notNull(),action:text("action").notNull(),category:text("category").notNull(),riskTier:text("risk_tier").notNull(),suggestionId:text("suggestion_id").notNull(),enabledAt:bigint("enabled_at",{mode:"number"}).notNull(),disabledAt:bigint("disabled_at",{mode:"number"}),modelKey:text("model_key"),selectorVersion:text("selector_version"),
},t=>[primaryKey({columns:[t.ownerUserId,t.accountId,t.action,t.category,t.riskTier]})]);
export const autonomyAudit=app.table("autonomy_audit",{
  id:bigserial("id",{mode:"number"}).primaryKey(),ownerUserId:text("owner_user_id").notNull(),accountId:text("account_id").notNull(),action:text("action").notNull(),category:text("category").notNull(),riskTier:text("risk_tier").notNull(),event:text("event").notNull(),reason:text("reason").notNull(),evidenceHash:text("evidence_hash").notNull(),createdAt:bigint("created_at",{mode:"number"}).notNull(),
});
export const eventObservations=app.table("intelligence_observations",{
  id:bigserial("id",{mode:"number"}).primaryKey(),xPostId:text("x_post_id").notNull(),authorId:text("author_id").notNull(),authorHandle:text("author_handle").notNull(),observedAt:bigint("observed_at",{mode:"number"}).notNull(),postCreatedAt:bigint("post_created_at",{mode:"number"}).notNull(),textSnapshot:text("text_snapshot").notNull(),referencedPostsJson:text("referenced_posts_json").notNull(),urlsJson:text("urls_json").notNull(),mediaJson:text("media_json").notNull(),language:text("language").notNull(),readerProvider:text("reader_provider").notNull(),rawHash:text("raw_hash").notNull(),firstSeenAt:bigint("first_seen_at",{mode:"number"}).notNull(),
});
export const eventMetricRevisions=app.table("intelligence_metric_revisions",{
  id:bigserial("id",{mode:"number"}).primaryKey(),observationId:bigint("observation_id",{mode:"number"}).notNull(),revision:integer("revision").notNull(),capturedAt:bigint("captured_at",{mode:"number"}).notNull(),likes:doublePrecision("likes"),replies:doublePrecision("replies"),reposts:doublePrecision("reposts"),quotes:doublePrecision("quotes"),views:doublePrecision("views"),censoredJson:text("censored_json").notNull(),readerProvider:text("reader_provider").notNull(),rawHash:text("raw_hash").notNull(),receivedAt:bigint("received_at",{mode:"number"}).notNull(),
});
