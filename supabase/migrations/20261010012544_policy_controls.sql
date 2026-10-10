CREATE TABLE IF NOT EXISTS ispatla_app.x_policy_kill_controls (
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('global','account','category','action')),
  value text NOT NULL,
  enabled boolean NOT NULL,
  version integer NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY(owner_user_id,scope,value)
);

CREATE TABLE IF NOT EXISTS ispatla_app.x_policy_kill_audit (
  id bigserial PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  scope text NOT NULL,
  value text NOT NULL,
  previous_enabled boolean,
  enabled boolean NOT NULL,
  previous_version integer NOT NULL,
  version integer NOT NULL,
  reason text NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS x_policy_kill_audit_owner_idx ON ispatla_app.x_policy_kill_audit(owner_user_id,id);

CREATE TABLE IF NOT EXISTS ispatla_app.x_reply_summon_audits (
  id uuid PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  connected_x_user_id text NOT NULL,
  target_id text NOT NULL,
  author_x_user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mention','quote')),
  observed_at bigint NOT NULL,
  source text NOT NULL CHECK (source='official_x_api'),
  UNIQUE(owner_user_id,account_id,target_id)
);
CREATE INDEX IF NOT EXISTS x_reply_summon_owner_target_idx
  ON ispatla_app.x_reply_summon_audits(owner_user_id,account_id,target_id,observed_at);
