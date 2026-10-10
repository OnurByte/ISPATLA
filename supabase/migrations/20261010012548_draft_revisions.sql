CREATE TABLE IF NOT EXISTS ispatla_app.draft_revisions (
  id bigserial PRIMARY KEY,
  draft_id bigint NOT NULL REFERENCES ispatla_app.drafts(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  account_id bigint,
  format text NOT NULL,
  text text NOT NULL,
  external_id text NOT NULL DEFAULT '',
  source_handle text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  CONSTRAINT draft_revisions_draft_revision_unique UNIQUE (draft_id, revision)
);
CREATE INDEX IF NOT EXISTS draft_revisions_owner_idx ON ispatla_app.draft_revisions(owner_user_id, draft_id, revision DESC);
