CREATE TABLE IF NOT EXISTS ispatla_app.evaluation_predictions (
  id text PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id text NOT NULL, candidate_id text NOT NULL, leakage_group text NOT NULL, model_key text NOT NULL,
  raw_score double precision NOT NULL, split text NOT NULL CHECK (split IN ('train','calibration','holdout')),
  selector_version text NOT NULL, selection_propensity double precision, action text NOT NULL, category text NOT NULL,
  format text NOT NULL, risk_tier text NOT NULL, features_json text NOT NULL,
  created_at bigint NOT NULL, resolve_by bigint NOT NULL, UNIQUE(owner_user_id,account_id,candidate_id,model_key)
);
CREATE INDEX IF NOT EXISTS evaluation_due_idx ON ispatla_app.evaluation_predictions(owner_user_id,resolve_by,split);
CREATE INDEX IF NOT EXISTS evaluation_group_idx ON ispatla_app.evaluation_predictions(owner_user_id,leakage_group);

CREATE TABLE IF NOT EXISTS ispatla_app.evaluation_outcome_revisions (
  id bigserial PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  prediction_id text NOT NULL REFERENCES ispatla_app.evaluation_predictions(id) ON DELETE CASCADE,
  captured_at bigint NOT NULL, observed_at bigint NOT NULL, views double precision, likes double precision,
  replies double precision, reposts double precision, quotes double precision, censored_json text NOT NULL,
  source text NOT NULL CHECK (source IN ('official_x_api','human_review')), provenance_ref text NOT NULL,
  followers_count bigint, followers_observed_at bigint, followers_x_user_id text, followers_provenance_ref text
);
CREATE INDEX IF NOT EXISTS evaluation_outcome_idx ON ispatla_app.evaluation_outcome_revisions(owner_user_id,prediction_id,captured_at);
CREATE TABLE IF NOT EXISTS ispatla_app.evaluation_labels (
  id bigserial PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  prediction_id text NOT NULL REFERENCES ispatla_app.evaluation_predictions(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('hit','miss','late_hit','wrong_account','wrong_format','policy_block','publisher_failure','cannibalization')),
  reviewer_ref text NOT NULL, labeled_at bigint NOT NULL, UNIQUE(owner_user_id,prediction_id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.evaluation_replays (
  id text PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id text NOT NULL, model_key text NOT NULL, dataset_hash text NOT NULL,
  split text NOT NULL CHECK (split='holdout'), sample_count integer NOT NULL,
  brier double precision, log_loss double precision, ece double precision, reliability_json text NOT NULL, created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS evaluation_replay_idx ON ispatla_app.evaluation_replays(owner_user_id,account_id,created_at);
CREATE TABLE IF NOT EXISTS ispatla_app.evaluation_calibration_profiles (
  id bigserial PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  model_key text NOT NULL, mapping_json text NOT NULL, sample_count integer NOT NULL, group_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('calibrated','insufficient')), created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.autonomy_suggestions (
  id text PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id text NOT NULL, action text NOT NULL, category text NOT NULL, risk_tier text NOT NULL,
  clean_approvals integer NOT NULL, policy_failures integer NOT NULL, auth_failures integer NOT NULL,
  duplicate_incidents integer NOT NULL, unacceptable_outcomes integer NOT NULL, evidence_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('suggested','accepted','declined','demoted')),
  created_at bigint NOT NULL, decided_at bigint, model_key text, selector_version text
);
CREATE TABLE IF NOT EXISTS ispatla_app.scoped_autonomy (
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id text NOT NULL, action text NOT NULL, category text NOT NULL, risk_tier text NOT NULL,
  suggestion_id text NOT NULL REFERENCES ispatla_app.autonomy_suggestions(id), enabled_at bigint NOT NULL,
  disabled_at bigint, model_key text, selector_version text, PRIMARY KEY(owner_user_id,account_id,action,category,risk_tier)
);
CREATE TABLE IF NOT EXISTS ispatla_app.autonomy_audit (
  id bigserial PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id text NOT NULL, action text NOT NULL, category text NOT NULL, risk_tier text NOT NULL,
  event text NOT NULL CHECK (event IN ('suggested','confirmed','declined','demoted')),
  reason text NOT NULL, evidence_hash text NOT NULL, created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_observations (
  id bigserial PRIMARY KEY, x_post_id text NOT NULL UNIQUE, author_id text NOT NULL, author_handle text NOT NULL,
  observed_at bigint NOT NULL, post_created_at bigint NOT NULL, text_snapshot text NOT NULL,
  referenced_posts_json text NOT NULL, urls_json text NOT NULL, media_json text NOT NULL,
  language text NOT NULL, reader_provider text NOT NULL, raw_hash text NOT NULL, first_seen_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS intelligence_observations_time_idx ON ispatla_app.intelligence_observations(observed_at);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_metric_revisions (
  id bigserial PRIMARY KEY, observation_id bigint NOT NULL REFERENCES ispatla_app.intelligence_observations(id) ON DELETE CASCADE,
  revision integer NOT NULL, captured_at bigint NOT NULL, likes double precision, replies double precision,
  reposts double precision, quotes double precision, views double precision, censored_json text NOT NULL,
  reader_provider text NOT NULL, raw_hash text NOT NULL, received_at bigint NOT NULL, UNIQUE(observation_id,revision)
);
CREATE INDEX IF NOT EXISTS intelligence_metric_revision_idx ON ispatla_app.intelligence_metric_revisions(observation_id,revision);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_events (
  id bigserial PRIMARY KEY, title text NOT NULL, category text NOT NULL, stage text NOT NULL DEFAULT 'SEED',
  first_seen_at bigint NOT NULL, last_seen_at bigint NOT NULL, merged_into bigint REFERENCES ispatla_app.intelligence_events(id)
);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_candidate_events (
  candidate_key text PRIMARY KEY, event_id bigint NOT NULL REFERENCES ispatla_app.intelligence_events(id) ON DELETE CASCADE,
  resolver text NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_claims (
  id bigserial PRIMARY KEY, event_id bigint NOT NULL REFERENCES ispatla_app.intelligence_events(id) ON DELETE CASCADE,
  claim_type text NOT NULL, normalized_text text NOT NULL, entities_json text NOT NULL,
  first_seen_at bigint NOT NULL, confidence_class text NOT NULL, verification_mode text NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_event_observations (
  event_id bigint NOT NULL REFERENCES ispatla_app.intelligence_events(id) ON DELETE CASCADE,
  observation_id bigint NOT NULL REFERENCES ispatla_app.intelligence_observations(id) ON DELETE CASCADE,
  attached_at bigint NOT NULL, PRIMARY KEY(event_id,observation_id)
);
CREATE INDEX IF NOT EXISTS intelligence_event_members_event_idx ON ispatla_app.intelligence_event_observations(event_id,attached_at);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_claim_evidence (
  claim_id bigint NOT NULL REFERENCES ispatla_app.intelligence_claims(id) ON DELETE CASCADE,
  observation_id bigint NOT NULL REFERENCES ispatla_app.intelligence_observations(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK(relation IN ('supports','contradicts')), linked_at bigint NOT NULL,
  PRIMARY KEY(claim_id,observation_id,relation)
);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_lineage (
  observation_id bigint NOT NULL REFERENCES ispatla_app.intelligence_observations(id) ON DELETE CASCADE,
  referenced_post_id text NOT NULL, relation text NOT NULL, PRIMARY KEY(observation_id,referenced_post_id,relation)
);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_event_audits (
  id bigserial PRIMARY KEY, action text NOT NULL CHECK(action IN ('merge','split')),
  source_event_id bigint NOT NULL, target_event_id bigint, reason text NOT NULL, details_json text NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ispatla_app.intelligence_threshold_profiles (
  id bigserial PRIMARY KEY, model text NOT NULL, language text NOT NULL, category text NOT NULL,
  comparison_kind text NOT NULL, version text NOT NULL, threshold double precision, sample_count integer NOT NULL,
  positive_count integer NOT NULL, negative_count integer NOT NULL, balanced_accuracy double precision,
  status text NOT NULL CHECK(status IN ('calibrated','insufficient')), fixture_hash text NOT NULL, created_at bigint NOT NULL
);
