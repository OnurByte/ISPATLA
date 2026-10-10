-- Baseline application schema ported from src/server/db.ts migrations 1-34.
-- JSON payload columns stay text for the existing serialized read/write contract.
CREATE SCHEMA IF NOT EXISTS ispatla_app;

CREATE TABLE IF NOT EXISTS ispatla_app.sources (
  id bigserial PRIMARY KEY, handle text NOT NULL UNIQUE, name text NOT NULL DEFAULT '',
  enabled smallint NOT NULL DEFAULT 1, max_posts integer NOT NULL DEFAULT 20,
  rights_status text NOT NULL DEFAULT 'unknown', profile_json text NOT NULL DEFAULT '{}', updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.source_events (
  id bigserial PRIMARY KEY, handle text NOT NULL, event text NOT NULL, score double precision NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '', created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS source_events_handle_idx ON ispatla_app.source_events(handle, created_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.observed_posts (
  id bigserial PRIMARY KEY, external_id text NOT NULL UNIQUE, source_handle text NOT NULL, author_handle text NOT NULL DEFAULT '',
  status_url text NOT NULL DEFAULT '', text text NOT NULL DEFAULT '', created_timestamp bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0, replies bigint NOT NULL DEFAULT 0, reposts bigint NOT NULL DEFAULT 0,
  quotes bigint NOT NULL DEFAULT 0, views bigint NOT NULL DEFAULT 0, author_followers bigint NOT NULL DEFAULT 0,
  author_blue_check_status text NOT NULL DEFAULT 'unknown', author_verification_status text NOT NULL DEFAULT 'unknown',
  media_count integer NOT NULL DEFAULT 0, media_json text NOT NULL DEFAULT '[]', raw_json text NOT NULL DEFAULT '{}',
  score double precision NOT NULL DEFAULT 0, score_reason text NOT NULL DEFAULT '', sensitive smallint NOT NULL DEFAULT 0,
  cluster_key text NOT NULL DEFAULT '', draft_status text NOT NULL DEFAULT 'not_started', draft_text text NOT NULL DEFAULT '',
  publish_status text NOT NULL DEFAULT 'not_started', observed_at bigint NOT NULL,
  relevance_score double precision, relevance_source text, relevance_json text, relevance_at bigint
);
CREATE INDEX IF NOT EXISTS observed_posts_score_idx ON ispatla_app.observed_posts(score DESC, observed_at DESC);
CREATE INDEX IF NOT EXISTS observed_posts_cluster_idx ON ispatla_app.observed_posts(cluster_key, publish_status);
CREATE TABLE IF NOT EXISTS ispatla_app.scan_runs (
  id bigserial PRIMARY KEY, started_at bigint NOT NULL, finished_at bigint NOT NULL, source_count integer NOT NULL DEFAULT 0,
  posts_seen integer NOT NULL DEFAULT 0, posts_new integer NOT NULL DEFAULT 0, errors text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'ok'
);
CREATE TABLE IF NOT EXISTS ispatla_app.publish_attempts (
  id bigserial PRIMARY KEY, post_external_id text NOT NULL, account_id bigint, status text NOT NULL,
  reason text NOT NULL DEFAULT '', receipt text NOT NULL DEFAULT '', remote_url text NOT NULL DEFAULT '', created_at bigint NOT NULL,
  updated_at bigint NOT NULL DEFAULT 0, occurrences integer NOT NULL DEFAULT 1, publication_intent_id bigint
);
CREATE INDEX IF NOT EXISTS publish_attempts_status_idx ON ispatla_app.publish_attempts(status, created_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.feedback_snapshots (
  id bigserial PRIMARY KEY, post_external_id text NOT NULL, likes bigint NOT NULL DEFAULT 0, replies bigint NOT NULL DEFAULT 0,
  reposts bigint NOT NULL DEFAULT 0, quotes bigint NOT NULL DEFAULT 0, views bigint NOT NULL DEFAULT 0,
  poll_votes bigint NOT NULL DEFAULT 0, publisher_blue_check_status text NOT NULL DEFAULT 'unknown',
  publisher_verification_status text NOT NULL DEFAULT 'unknown', milestone text NOT NULL DEFAULT 'legacy', captured_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_snapshots_post_milestone_idx ON ispatla_app.feedback_snapshots(post_external_id, milestone, captured_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.account_metric_snapshots (
  id bigserial PRIMARY KEY, account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  followers bigint NOT NULL DEFAULT 0, following bigint NOT NULL DEFAULT 0, statuses bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0, media_count bigint NOT NULL DEFAULT 0, blue_check_status text NOT NULL DEFAULT 'unknown',
  verification_status text NOT NULL DEFAULT 'unknown', captured_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS account_metric_snapshots_account_idx ON ispatla_app.account_metric_snapshots(account_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.competitors (
  id bigserial PRIMARY KEY, handle text NOT NULL UNIQUE, name text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '',
  enabled smallint NOT NULL DEFAULT 1, initialized_at bigint NOT NULL DEFAULT 0, last_success_at bigint NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '', created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.competitor_profile_snapshots (
  id bigserial PRIMARY KEY, competitor_id bigint NOT NULL REFERENCES ispatla_app.competitors(id) ON DELETE CASCADE,
  followers bigint NOT NULL DEFAULT 0, following bigint NOT NULL DEFAULT 0, statuses bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0, media_count bigint NOT NULL DEFAULT 0, blue_check_status text NOT NULL DEFAULT 'unknown',
  verification_status text NOT NULL DEFAULT 'unknown', captured_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS competitor_profile_snapshots_competitor_idx ON ispatla_app.competitor_profile_snapshots(competitor_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.competitor_posts (
  id bigserial PRIMARY KEY, competitor_id bigint NOT NULL REFERENCES ispatla_app.competitors(id) ON DELETE CASCADE,
  external_id text NOT NULL UNIQUE, status_url text NOT NULL DEFAULT '', text text NOT NULL DEFAULT '', created_timestamp bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0, replies bigint NOT NULL DEFAULT 0, reposts bigint NOT NULL DEFAULT 0,
  quotes bigint NOT NULL DEFAULT 0, views bigint NOT NULL DEFAULT 0, poll_votes bigint NOT NULL DEFAULT 0,
  author_blue_check_status text NOT NULL DEFAULT 'unknown', author_verification_status text NOT NULL DEFAULT 'unknown',
  media_count integer NOT NULL DEFAULT 0, media_json text NOT NULL DEFAULT '[]', raw_json text NOT NULL DEFAULT '{}', first_seen_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS competitor_posts_competitor_idx ON ispatla_app.competitor_posts(competitor_id, created_timestamp DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.competitor_post_snapshots (
  id bigserial PRIMARY KEY, external_id text NOT NULL, likes bigint NOT NULL DEFAULT 0, replies bigint NOT NULL DEFAULT 0,
  reposts bigint NOT NULL DEFAULT 0, quotes bigint NOT NULL DEFAULT 0, views bigint NOT NULL DEFAULT 0,
  poll_votes bigint NOT NULL DEFAULT 0, milestone text NOT NULL DEFAULT 'history', captured_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS competitor_post_snapshots_post_milestone_idx ON ispatla_app.competitor_post_snapshots(external_id, milestone, captured_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.secrets (
  name text PRIMARY KEY, provider text NOT NULL DEFAULT '', ciphertext text NOT NULL, updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.app_settings (
  name text PRIMARY KEY, value text NOT NULL DEFAULT '', updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.automation_logs (
  id bigserial PRIMARY KEY, task_id text NOT NULL, status text NOT NULL, started_at bigint NOT NULL,
  finished_at bigint, message text NOT NULL DEFAULT '', details_json text NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS automation_logs_task_idx ON ispatla_app.automation_logs(task_id, started_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.drafts (
  id bigserial PRIMARY KEY, batch_id text NOT NULL DEFAULT '', origin text NOT NULL DEFAULT 'manual', prompt text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '', variant_mode text NOT NULL DEFAULT 'same_text',
  source_handle text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '', source_score double precision NOT NULL DEFAULT 0,
  external_id text NOT NULL DEFAULT '', account_id bigint REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  format text NOT NULL DEFAULT 'post', text text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft', gate_reason text NOT NULL DEFAULT '',
  created_at bigint NOT NULL, updated_at bigint NOT NULL, owner_user_id text REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS drafts_status_idx ON ispatla_app.drafts(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS drafts_owner_idx ON ispatla_app.drafts(owner_user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.automation_jobs (
  id bigserial PRIMARY KEY, draft_id bigint NOT NULL REFERENCES ispatla_app.drafts(id) ON DELETE CASCADE,
  account_id bigint REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE, action text NOT NULL DEFAULT 'post',
  scheduled_at bigint NOT NULL, status text NOT NULL DEFAULT 'queued', receipt text NOT NULL DEFAULT '', reason text NOT NULL DEFAULT '',
  remote_url text NOT NULL DEFAULT '', reconciliation_status text NOT NULL DEFAULT 'not_started', attempts integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL, updated_at bigint NOT NULL, lease_token text, lease_until bigint, heartbeat_at bigint,
  max_attempts integer NOT NULL DEFAULT 5, next_attempt_at bigint NOT NULL DEFAULT 0, error_class text NOT NULL DEFAULT '',
  dead_lettered_at bigint, remote_write_started_at bigint, approval_expires_at bigint, approval_snapshot_id bigint
);
CREATE INDEX IF NOT EXISTS automation_jobs_status_idx ON ispatla_app.automation_jobs(status, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS automation_jobs_retry_idx ON ispatla_app.automation_jobs(status, scheduled_at, next_attempt_at);
CREATE INDEX IF NOT EXISTS automation_jobs_lease_idx ON ispatla_app.automation_jobs(status, lease_until);
CREATE TABLE IF NOT EXISTS ispatla_app.draft_batches (
  id text PRIMARY KEY, prompt text NOT NULL DEFAULT '', format text NOT NULL DEFAULT 'post', variant_mode text NOT NULL DEFAULT 'per_account',
  account_ids_json text NOT NULL DEFAULT '[]', provider text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft',
  created_at bigint NOT NULL, updated_at bigint NOT NULL, owner_user_id text REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS draft_batches_owner_idx ON ispatla_app.draft_batches(owner_user_id, id);
CREATE TABLE IF NOT EXISTS ispatla_app.usage_events (
  id bigserial PRIMARY KEY, kind text NOT NULL, provider text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '',
  units integer NOT NULL DEFAULT 1, estimated_usd double precision NOT NULL DEFAULT 0, metadata_json text NOT NULL DEFAULT '{}',
  created_at bigint NOT NULL, owner_user_id text REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  estimated_cost_usd double precision, reported_cost_usd double precision, cost_basis text NOT NULL DEFAULT 'unknown',
  input_tokens bigint, output_tokens bigint, reservation_id text
);
CREATE INDEX IF NOT EXISTS usage_events_created_idx ON ispatla_app.usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_owner_idx ON ispatla_app.usage_events(owner_user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.opportunity_clusters (
  id bigserial PRIMARY KEY, cluster_key text NOT NULL UNIQUE, kind text NOT NULL DEFAULT 'hybrid',
  first_seen_at bigint NOT NULL, last_seen_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.cluster_observations (
  cluster_id bigint NOT NULL REFERENCES ispatla_app.opportunity_clusters(id) ON DELETE CASCADE,
  post_external_id text NOT NULL, observed_at bigint NOT NULL, PRIMARY KEY(cluster_id, post_external_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.account_opportunities (
  id bigserial PRIMARY KEY, cluster_id bigint NOT NULL REFERENCES ispatla_app.opportunity_clusters(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'candidate', primary_category_id bigint,
  matched_category_ids_json text NOT NULL DEFAULT '[]', category_scores_json text NOT NULL DEFAULT '{}',
  expected_incremental_reach double precision NOT NULL DEFAULT 0, publish_confidence double precision NOT NULL DEFAULT 0,
  created_at bigint NOT NULL, updated_at bigint NOT NULL, UNIQUE(cluster_id, account_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.publications (
  id bigserial PRIMARY KEY, cluster_id bigint NOT NULL REFERENCES ispatla_app.opportunity_clusters(id) ON DELETE CASCADE,
  account_opportunity_id bigint NOT NULL UNIQUE REFERENCES ispatla_app.account_opportunities(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  source_observation_external_id text NOT NULL DEFAULT '', remote_post_id text NOT NULL DEFAULT '', remote_url text NOT NULL DEFAULT '',
  status text NOT NULL, requested_at bigint NOT NULL, confirmed_at bigint, draft_id bigint, publication_intent_id bigint
);
CREATE INDEX IF NOT EXISTS publications_status_idx ON ispatla_app.publications(status, requested_at ASC);
CREATE INDEX IF NOT EXISTS publications_remote_post_idx ON ispatla_app.publications(account_id, remote_post_id);
CREATE UNIQUE INDEX IF NOT EXISTS publications_intent_idx ON ispatla_app.publications(publication_intent_id) WHERE publication_intent_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ispatla_app.publication_metric_snapshots (
  id bigserial PRIMARY KEY, publication_id bigint NOT NULL REFERENCES ispatla_app.publications(id) ON DELETE CASCADE,
  remote_post_id text NOT NULL DEFAULT '', milestone text NOT NULL, likes bigint, replies bigint, reposts bigint,
  quotes bigint, views bigint, poll_votes bigint, metric_quality text NOT NULL DEFAULT 'ok', captured_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS publication_metric_snapshots_publication_idx ON ispatla_app.publication_metric_snapshots(publication_id, milestone, captured_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.categories (
  id bigserial PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL, enabled smallint NOT NULL DEFAULT 1,
  built_in smallint NOT NULL DEFAULT 0, base_strategy text NOT NULL, cluster_strategy text NOT NULL, verification_mode text NOT NULL,
  description text NOT NULL DEFAULT '', positive_examples_json text NOT NULL DEFAULT '[]', negative_examples_json text NOT NULL DEFAULT '[]',
  keywords_json text NOT NULL DEFAULT '[]', excluded_keywords_json text NOT NULL DEFAULT '[]', seed_handles_json text NOT NULL DEFAULT '[]',
  default_formats_json text NOT NULL DEFAULT '["post"]', source_policy_json text NOT NULL DEFAULT '{}', risk_policy_json text NOT NULL DEFAULT '{}',
  scoring_policy_json text NOT NULL DEFAULT '{}', publishing_policy_json text NOT NULL DEFAULT '{}', ai_context text NOT NULL DEFAULT '',
  created_at bigint NOT NULL, updated_at bigint NOT NULL, owner_user_id text REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id bigint REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS categories_owner_account_idx ON ispatla_app.categories(owner_user_id, account_id);
CREATE TABLE IF NOT EXISTS ispatla_app.account_categories (
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES ispatla_app.categories(id) ON DELETE CASCADE,
  enabled smallint NOT NULL DEFAULT 1, is_primary smallint NOT NULL DEFAULT 0, weight double precision NOT NULL DEFAULT 1,
  priority integer NOT NULL DEFAULT 0, publish_threshold double precision, daily_budget integer,
  style_override_json text NOT NULL DEFAULT '{}', ai_route_override_json text NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'manual', user_modified_at bigint, PRIMARY KEY(account_id, category_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_categories_one_primary_idx ON ispatla_app.account_categories(account_id) WHERE is_primary=1;
CREATE TABLE IF NOT EXISTS ispatla_app.source_categories (
  source_handle text NOT NULL, category_id bigint NOT NULL REFERENCES ispatla_app.categories(id) ON DELETE CASCADE,
  monitoring_tier text NOT NULL DEFAULT 'C', discovery_weight double precision NOT NULL DEFAULT 1, category_reputation double precision,
  enabled smallint NOT NULL DEFAULT 1, last_evidence_at bigint NOT NULL DEFAULT 0, PRIMARY KEY(source_handle, category_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.category_competitors (
  category_id bigint NOT NULL REFERENCES ispatla_app.categories(id) ON DELETE CASCADE,
  competitor_id bigint NOT NULL REFERENCES ispatla_app.competitors(id) ON DELETE CASCADE,
  dominance_weight double precision NOT NULL DEFAULT 1, account_similarity_weight double precision NOT NULL DEFAULT 1,
  topic_weight double precision NOT NULL DEFAULT 1, PRIMARY KEY(category_id, competitor_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.source_reader_cursors (
  source_handle text PRIMARY KEY, last_seen_post_id text NOT NULL DEFAULT '', last_seen_created_at bigint NOT NULL DEFAULT 0,
  pagination_cursor text NOT NULL DEFAULT '', gap_detected smallint NOT NULL DEFAULT 0, last_success_at bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ispatla_app.reader_health (
  id bigserial PRIMARY KEY, transport text NOT NULL, ok smallint NOT NULL, error text NOT NULL DEFAULT '', checked_at bigint NOT NULL,
  latency_ms integer NOT NULL DEFAULT 0, freshness_seconds integer, missing_fields_json text NOT NULL DEFAULT '[]', schema_drift smallint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reader_health_transport_idx ON ispatla_app.reader_health(transport, checked_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.post_metric_snapshots (
  id bigserial PRIMARY KEY, post_external_id text NOT NULL, likes bigint, replies bigint, reposts bigint, quotes bigint,
  views bigint, followers bigint, metric_quality text NOT NULL DEFAULT 'unknown', captured_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS post_metric_snapshots_post_idx ON ispatla_app.post_metric_snapshots(post_external_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.cluster_metric_snapshots (
  id bigserial PRIMARY KEY, cluster_id bigint NOT NULL REFERENCES ispatla_app.opportunity_clusters(id) ON DELETE CASCADE,
  post_count integer NOT NULL, likes bigint, replies bigint, reposts bigint, quotes bigint, views bigint,
  metric_quality text NOT NULL DEFAULT 'unknown', captured_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS cluster_metric_snapshots_cluster_idx ON ispatla_app.cluster_metric_snapshots(cluster_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.cluster_categories (
  cluster_id bigint NOT NULL REFERENCES ispatla_app.opportunity_clusters(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES ispatla_app.categories(id) ON DELETE CASCADE,
  confidence double precision NOT NULL DEFAULT 0, classified_at bigint NOT NULL, PRIMARY KEY(cluster_id, category_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.cluster_audits (
  id bigserial PRIMARY KEY, cluster_id bigint NOT NULL REFERENCES ispatla_app.opportunity_clusters(id) ON DELETE CASCADE,
  action text NOT NULL, from_kind text NOT NULL DEFAULT '', to_kind text NOT NULL DEFAULT '', reason text NOT NULL DEFAULT '', created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.decision_records (
  id bigserial PRIMARY KEY, cluster_id bigint REFERENCES ispatla_app.opportunity_clusters(id) ON DELETE SET NULL,
  post_external_id text NOT NULL, candidate_account_ids_json text NOT NULL DEFAULT '[]', category_slugs_json text NOT NULL DEFAULT '[]',
  score double precision NOT NULL DEFAULT 0, selected smallint NOT NULL DEFAULT 0, reason_code text NOT NULL,
  details_json text NOT NULL DEFAULT '{}', decided_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS decision_records_post_idx ON ispatla_app.decision_records(post_external_id, decided_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.account_subscription_events (
  id bigserial PRIMARY KEY, account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  tier text NOT NULL, effective_at bigint NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL, UNIQUE(account_id, effective_at)
);
CREATE INDEX IF NOT EXISTS account_subscription_events_account_idx ON ispatla_app.account_subscription_events(account_id, effective_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.account_subscription_state (
  account_id bigint PRIMARY KEY REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'unknown', observed_at bigint NOT NULL DEFAULT 0, history_complete smallint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ispatla_app.monitor_targets (
  id bigserial PRIMARY KEY, kind text NOT NULL, target_key text NOT NULL, category_id bigint REFERENCES ispatla_app.categories(id) ON DELETE SET NULL,
  source_handle text NOT NULL DEFAULT '', query text NOT NULL DEFAULT '', conversation_id text NOT NULL DEFAULT '', lifecycle text NOT NULL DEFAULT 'active',
  tier text NOT NULL DEFAULT 'normal', interval_seconds integer NOT NULL DEFAULT 300, burst_until bigint NOT NULL DEFAULT 0,
  next_run_at bigint NOT NULL DEFAULT 0, enabled smallint NOT NULL DEFAULT 1, priority double precision NOT NULL DEFAULT 1,
  runs bigint NOT NULL DEFAULT 0, results bigint NOT NULL DEFAULT 0, unique_results bigint NOT NULL DEFAULT 0,
  hits bigint NOT NULL DEFAULT 0, duplicates bigint NOT NULL DEFAULT 0, false_positives bigint NOT NULL DEFAULT 0,
  reviewed bigint NOT NULL DEFAULT 0, lead_time_total bigint NOT NULL DEFAULT 0, last_result_at bigint NOT NULL DEFAULT 0,
  last_hit_at bigint NOT NULL DEFAULT 0, created_at bigint NOT NULL, updated_at bigint NOT NULL, UNIQUE(kind, target_key)
);
CREATE INDEX IF NOT EXISTS monitor_targets_due_idx ON ispatla_app.monitor_targets(enabled, lifecycle, next_run_at, priority DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.monitor_runs (
  id bigserial PRIMARY KEY, target_id bigint REFERENCES ispatla_app.monitor_targets(id) ON DELETE SET NULL,
  day_key text NOT NULL, budget_bucket text NOT NULL, status text NOT NULL DEFAULT 'running', requested integer NOT NULL DEFAULT 1,
  returned integer NOT NULL DEFAULT 0, unique_results integer NOT NULL DEFAULT 0, hits integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0, false_positives integer NOT NULL DEFAULT 0, lead_time_total bigint NOT NULL DEFAULT 0,
  started_at bigint NOT NULL, finished_at bigint, error text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS monitor_runs_budget_idx ON ispatla_app.monitor_runs(day_key, budget_bucket);
CREATE TABLE IF NOT EXISTS ispatla_app.monitor_observations (
  id bigserial PRIMARY KEY, target_id bigint NOT NULL REFERENCES ispatla_app.monitor_targets(id) ON DELETE CASCADE,
  post_external_id text NOT NULL, hit smallint NOT NULL DEFAULT 0, duplicate smallint NOT NULL DEFAULT 0,
  false_positive smallint, lead_seconds bigint NOT NULL DEFAULT 0, observed_at bigint NOT NULL, UNIQUE(target_id, post_external_id)
);
CREATE INDEX IF NOT EXISTS monitor_observations_target_idx ON ispatla_app.monitor_observations(target_id, observed_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.publication_intents (
  id bigserial PRIMARY KEY, draft_id bigint NOT NULL REFERENCES ispatla_app.drafts(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'pending_approval',
  idempotency_key text NOT NULL UNIQUE, text text NOT NULL, media_path text NOT NULL DEFAULT '', media_hash text NOT NULL DEFAULT '',
  receipt text NOT NULL DEFAULT '', remote_url text NOT NULL DEFAULT '', reason text NOT NULL DEFAULT '', requested_at bigint NOT NULL,
  approved_at bigint, dispatched_at bigint, confirmed_at bigint, updated_at bigint NOT NULL,
  attempts integer NOT NULL DEFAULT 0, lease_token text, lease_until bigint, heartbeat_at bigint,
  max_attempts integer NOT NULL DEFAULT 5, next_attempt_at bigint NOT NULL DEFAULT 0, error_class text NOT NULL DEFAULT '',
  dead_lettered_at bigint, remote_write_started_at bigint, remote_post_id text NOT NULL DEFAULT '',
  approval_expires_at bigint, approval_snapshot_id bigint
);
CREATE INDEX IF NOT EXISTS publication_intents_status_idx ON ispatla_app.publication_intents(status, requested_at ASC);
CREATE INDEX IF NOT EXISTS publication_intents_lease_idx ON ispatla_app.publication_intents(status, lease_until);
CREATE TABLE IF NOT EXISTS ispatla_app.draft_evaluations (
  id bigserial PRIMARY KEY, draft_id bigint NOT NULL UNIQUE REFERENCES ispatla_app.drafts(id) ON DELETE CASCADE,
  account_id bigint REFERENCES ispatla_app.accounts(id) ON DELETE SET NULL, category_slug text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'shadow_cold_start', score double precision NOT NULL DEFAULT 0, confidence double precision NOT NULL DEFAULT 0,
  predicted_residual double precision, baseline_scope text NOT NULL DEFAULT 'none', baseline_samples integer NOT NULL DEFAULT 0,
  baseline_views double precision, baseline_likes double precision, baseline_replies double precision, baseline_reposts double precision,
  baseline_quotes double precision, baseline_engagement_rate double precision, predicted_views double precision,
  predicted_replies double precision, predicted_reposts double precision, predicted_quotes double precision,
  features_json text NOT NULL DEFAULT '{}', semantic_json text NOT NULL DEFAULT '{}', helped_json text NOT NULL DEFAULT '[]',
  hurt_json text NOT NULL DEFAULT '[]', created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS draft_evaluations_account_idx ON ispatla_app.draft_evaluations(account_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.jev_scores (
  id bigserial PRIMARY KEY, subject_kind text NOT NULL DEFAULT '', subject_id text NOT NULL DEFAULT '', question_key text NOT NULL DEFAULT '',
  score double precision NOT NULL DEFAULT 0, mode text NOT NULL DEFAULT 'off', model text NOT NULL DEFAULT '', latency_ms integer NOT NULL DEFAULT 0,
  request_hash text NOT NULL DEFAULT '', diagnostics_json text NOT NULL DEFAULT '[]', created_at bigint NOT NULL,
  UNIQUE(subject_kind, subject_id, question_key, request_hash)
);
CREATE INDEX IF NOT EXISTS jev_scores_subject_idx ON ispatla_app.jev_scores(subject_kind, subject_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.jev_cache (
  request_hash text PRIMARY KEY, scores_json text NOT NULL DEFAULT '{}', reported_model text NOT NULL DEFAULT '', created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS jev_cache_created_idx ON ispatla_app.jev_cache(created_at DESC);
CREATE TABLE IF NOT EXISTS ispatla_app.draft_variants (
  id bigserial PRIMARY KEY, draft_id bigint NOT NULL REFERENCES ispatla_app.drafts(id) ON DELETE CASCADE,
  variant_index integer NOT NULL, angle text NOT NULL DEFAULT '', format text NOT NULL DEFAULT 'post', text text NOT NULL DEFAULT '',
  chosen smallint NOT NULL DEFAULT 0, evaluator_score double precision, jev_score double precision, combined_score double precision,
  selection_mode text NOT NULL DEFAULT 'evaluator', gate_reason text NOT NULL DEFAULT '', detail_json text NOT NULL DEFAULT '{}',
  created_at bigint NOT NULL, UNIQUE(draft_id, variant_index)
);
CREATE INDEX IF NOT EXISTS draft_variants_draft_idx ON ispatla_app.draft_variants(draft_id, variant_index);
CREATE TABLE IF NOT EXISTS ispatla_app.automation_job_events (
  id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES ispatla_app.automation_jobs(id) ON DELETE CASCADE,
  event text NOT NULL, status text NOT NULL DEFAULT '', error_class text NOT NULL DEFAULT '', created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS automation_job_events_job_idx ON ispatla_app.automation_job_events(job_id, id);
CREATE TABLE IF NOT EXISTS ispatla_app.publication_intent_events (
  id bigserial PRIMARY KEY, intent_id bigint NOT NULL REFERENCES ispatla_app.publication_intents(id) ON DELETE CASCADE,
  event text NOT NULL, status text NOT NULL DEFAULT '', error_class text NOT NULL DEFAULT '', created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS publication_intent_events_intent_idx ON ispatla_app.publication_intent_events(intent_id, id);
CREATE TABLE IF NOT EXISTS ispatla_app.account_dispatch_leases (
  account_id bigint PRIMARY KEY REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  lease_token text NOT NULL, lease_until bigint NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS account_dispatch_leases_expiry_idx ON ispatla_app.account_dispatch_leases(lease_until);
CREATE TABLE IF NOT EXISTS ispatla_app.legacy_transport_evidence (
  entity text NOT NULL, entity_id bigint NOT NULL, metadata_json text NOT NULL, archived_at bigint NOT NULL, PRIMARY KEY(entity, entity_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.publication_approval_snapshots (
  id bigserial PRIMARY KEY, entity_type text NOT NULL CHECK(entity_type IN ('publication_intent','automation_job')),
  entity_id bigint NOT NULL, draft_id bigint NOT NULL REFERENCES ispatla_app.drafts(id) ON DELETE CASCADE,
  draft_revision integer NOT NULL, text text NOT NULL, account_id bigint REFERENCES ispatla_app.accounts(id) ON DELETE SET NULL,
  action text NOT NULL, format text NOT NULL, target_id text NOT NULL DEFAULT '', external_id text NOT NULL DEFAULT '',
  source_handle text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '', media_hash text NOT NULL DEFAULT '',
  approval_source text NOT NULL CHECK(approval_source IN ('human','automatic')), approved_at bigint NOT NULL, expires_at bigint NOT NULL,
  UNIQUE(entity_type, entity_id)
);
CREATE FUNCTION ispatla_app.reject_approval_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approval snapshots are immutable';
END;
$$;
DROP TRIGGER IF EXISTS publication_approval_snapshots_no_update ON ispatla_app.publication_approval_snapshots;
CREATE TRIGGER publication_approval_snapshots_no_update
  BEFORE UPDATE ON ispatla_app.publication_approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION ispatla_app.reject_approval_snapshot_mutation();
DROP TRIGGER IF EXISTS publication_approval_snapshots_no_delete ON ispatla_app.publication_approval_snapshots;
CREATE TRIGGER publication_approval_snapshots_no_delete
  BEFORE DELETE ON ispatla_app.publication_approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION ispatla_app.reject_approval_snapshot_mutation();
CREATE TABLE IF NOT EXISTS ispatla_app.account_category_inference_jobs (
  id bigserial PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE, version integer NOT NULL,
  status text NOT NULL CHECK(status IN ('running','ready','insufficient_evidence','failed')), result_json text,
  created_at bigint NOT NULL, updated_at bigint NOT NULL, UNIQUE(owner_user_id, account_id, version)
);
CREATE TABLE IF NOT EXISTS ispatla_app.account_category_inferences (
  id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES ispatla_app.account_category_inference_jobs(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES ispatla_app.categories(id) ON DELETE CASCADE,
  confidence double precision NOT NULL, evidence_json text NOT NULL, model_id text NOT NULL DEFAULT 'deterministic-keyword-v1',
  prompt_version text NOT NULL DEFAULT 'none', inference_version integer NOT NULL, suggested_at bigint NOT NULL,
  accepted_at bigint, rejected_at bigint, UNIQUE(job_id, category_id)
);
CREATE INDEX IF NOT EXISTS account_category_inferences_owner_idx ON ispatla_app.account_category_inferences(owner_user_id, account_id, job_id);
CREATE TABLE IF NOT EXISTS ispatla_app.hit_shares (
  id bigserial PRIMARY KEY, public_id text NOT NULL UNIQUE,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  prediction_id text NOT NULL, remote_post_id text NOT NULL, created_at bigint NOT NULL, revoked_at bigint,
  leaderboard_opt_in smallint NOT NULL DEFAULT 0 CHECK(leaderboard_opt_in IN (0,1))
);
CREATE INDEX IF NOT EXISTS hit_shares_owner_idx ON ispatla_app.hit_shares(owner_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hit_shares_active_post_idx ON ispatla_app.hit_shares(owner_user_id, remote_post_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS ispatla_app.hit_evidence_exclusions (
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  remote_post_id text NOT NULL, reason text NOT NULL, flagged_at bigint NOT NULL, PRIMARY KEY(owner_user_id, account_id, remote_post_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.ai_budget_reservations (
  id text PRIMARY KEY, owner_user_id text REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  task text NOT NULL, provider text NOT NULL, model text NOT NULL, reserved_usd double precision,
  status text NOT NULL CHECK(status IN ('pending','settled','released','ambiguous')), created_at bigint NOT NULL, settled_at bigint
);
CREATE TABLE IF NOT EXISTS ispatla_app.account_sources (
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  source_handle text NOT NULL REFERENCES ispatla_app.sources(handle) ON DELETE CASCADE,
  enabled smallint NOT NULL DEFAULT 1, max_posts integer NOT NULL DEFAULT 20, rights_status text NOT NULL DEFAULT 'unknown',
  name_override text NOT NULL DEFAULT '', niche text NOT NULL DEFAULT '', topics_json text NOT NULL DEFAULT '[]', tone text NOT NULL DEFAULT '',
  pinned smallint NOT NULL DEFAULT 0, PRIMARY KEY(account_id, source_handle)
);
CREATE TABLE IF NOT EXISTS ispatla_app.account_source_categories (
  account_id bigint NOT NULL, source_handle text NOT NULL, category_id bigint NOT NULL REFERENCES ispatla_app.categories(id) ON DELETE CASCADE,
  monitoring_tier text NOT NULL DEFAULT 'C', discovery_weight double precision NOT NULL DEFAULT 1, category_reputation double precision,
  enabled smallint NOT NULL DEFAULT 1, last_evidence_at bigint NOT NULL DEFAULT 0, PRIMARY KEY(account_id, source_handle, category_id),
  FOREIGN KEY(account_id, source_handle) REFERENCES ispatla_app.account_sources(account_id, source_handle) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS account_source_categories_lookup_idx ON ispatla_app.account_source_categories(account_id, source_handle, enabled);

-- SQLite migrations history and seed/data transforms are intentionally not copied here.
