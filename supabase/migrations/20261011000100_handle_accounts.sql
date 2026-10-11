BEGIN;
ALTER TABLE ispatla_app.accounts ADD COLUMN IF NOT EXISTS x_user_id text;
ALTER TABLE ispatla_app.accounts ADD COLUMN IF NOT EXISTS ownership_verified_at bigint;
ALTER TABLE ispatla_app.accounts DROP CONSTRAINT IF EXISTS accounts_handle_key;
UPDATE ispatla_app.accounts a SET x_user_id=x.x_user_id, ownership_verified_at=x.connected_at
FROM ispatla_app.x_oauth_accounts x WHERE x.account_id=a.id AND a.x_user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_owner_x_id_unique ON ispatla_app.accounts(owner_user_id,x_user_id) WHERE x_user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ispatla_app.x_account_claims (
  account_id bigint PRIMARY KEY REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  x_user_id text NOT NULL, token_hash text NOT NULL, expires_at bigint NOT NULL, consumed_at bigint
);
ALTER TABLE ispatla_app.x_account_claims ENABLE ROW LEVEL SECURITY;
COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS ispatla_app.publication_preparations (
 id uuid PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
 draft_id bigint NOT NULL REFERENCES ispatla_app.drafts(id) ON DELETE CASCADE,
 account_id bigint NOT NULL REFERENCES ispatla_app.accounts(id) ON DELETE CASCADE,
 x_user_id text NOT NULL, text text NOT NULL, text_hash text NOT NULL, format text NOT NULL, target_id text NOT NULL, method text NOT NULL,
 expires_at bigint NOT NULL, post_id text UNIQUE, evidence text NOT NULL DEFAULT 'not_published', verified_at bigint
);
ALTER TABLE ispatla_app.publication_preparations ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS ispatla_app.mcp_clients (id uuid PRIMARY KEY, name text NOT NULL, redirect_uris jsonb NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS ispatla_app.mcp_authorizations (
 id uuid PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES ispatla_app.mcp_clients(id) ON DELETE CASCADE,
 redirect_uri text NOT NULL, state text NOT NULL, challenge text NOT NULL, scope text NOT NULL,
 audience text NOT NULL, expires_at bigint NOT NULL, code_hash text UNIQUE, consumed_at bigint
);
CREATE TABLE IF NOT EXISTS ispatla_app.mcp_grants (
 id uuid PRIMARY KEY, owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES ispatla_app.mcp_clients(id) ON DELETE CASCADE,
 scope text NOT NULL, audience text NOT NULL, token_hash text NOT NULL UNIQUE, refresh_hash text NOT NULL UNIQUE,
 expires_at bigint NOT NULL, refresh_expires_at bigint NOT NULL, revoked_at bigint
);
CREATE TABLE IF NOT EXISTS ispatla_app.mcp_admission (key text PRIMARY KEY, count integer NOT NULL, window_started_at bigint NOT NULL);
ALTER TABLE ispatla_app.mcp_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ispatla_app.mcp_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ispatla_app.mcp_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ispatla_app.mcp_admission ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ispatla_app.x_account_claims, ispatla_app.publication_preparations, ispatla_app.mcp_clients, ispatla_app.mcp_authorizations, ispatla_app.mcp_grants, ispatla_app.mcp_admission FROM anon, authenticated;
COMMIT;
