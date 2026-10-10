CREATE TABLE IF NOT EXISTS ispatla_app.accounts (
  id bigserial PRIMARY KEY,
  account_key text NOT NULL UNIQUE,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  default_account boolean NOT NULL DEFAULT false,
  automation_mode text NOT NULL DEFAULT 'manual',
  daily_limit integer NOT NULL DEFAULT 24,
  capabilities_json text NOT NULL DEFAULT '[]',
  style_profile_json text NOT NULL DEFAULT '{}',
  updated_at bigint NOT NULL,
  UNIQUE(owner_user_id, id)
);
CREATE INDEX IF NOT EXISTS accounts_owner_idx ON ispatla_app.accounts(owner_user_id, id);

CREATE TABLE IF NOT EXISTS ispatla_app.x_oauth_transactions (
  id uuid PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  encrypted_code_verifier text NOT NULL,
  requested_scopes text[] NOT NULL,
  return_to text NOT NULL,
  expires_at bigint NOT NULL,
  consumed_at bigint,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS x_oauth_transactions_expiry_idx ON ispatla_app.x_oauth_transactions(expires_at);

CREATE TABLE IF NOT EXISTS ispatla_app.x_oauth_accounts (
  x_user_id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  account_id bigint NOT NULL UNIQUE,
  handle text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  auth_state text NOT NULL DEFAULT 'connected',
  connected_at bigint NOT NULL,
  last_health_at bigint NOT NULL,
  last_auth_error text NOT NULL DEFAULT '',
  FOREIGN KEY(owner_user_id, account_id) REFERENCES ispatla_app.accounts(owner_user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS x_oauth_accounts_owner_idx ON ispatla_app.x_oauth_accounts(owner_user_id, account_id);

CREATE TABLE IF NOT EXISTS ispatla_app.x_oauth_credentials (
  account_id bigint PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  encryption_key_id text NOT NULL,
  access_expires_at bigint NOT NULL,
  scopes text[] NOT NULL,
  token_version bigint NOT NULL DEFAULT 1,
  refreshed_at bigint NOT NULL,
  revoked_at bigint,
  refresh_lease_id uuid,
  refresh_lease_until bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  FOREIGN KEY(owner_user_id, account_id) REFERENCES ispatla_app.accounts(owner_user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS x_oauth_credentials_owner_idx ON ispatla_app.x_oauth_credentials(owner_user_id, account_id);

CREATE TABLE IF NOT EXISTS ispatla_app.automation_consents (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL,
  owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK(action_type IN ('post','repost','reply','future_quote')),
  mode text NOT NULL DEFAULT 'shadow',
  policy_version text NOT NULL,
  consent_copy_version text NOT NULL,
  daily_limit integer NOT NULL DEFAULT 0,
  cadence_seconds integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  granted_at bigint,
  revoked_at bigint,
  updated_at bigint NOT NULL,
  UNIQUE(account_id, action_type),
  FOREIGN KEY(owner_user_id, account_id) REFERENCES ispatla_app.accounts(owner_user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS automation_consents_owner_idx ON ispatla_app.automation_consents(owner_user_id, account_id);

CREATE TABLE IF NOT EXISTS ispatla_app.user_profile_x_identity (
  owner_user_id text PRIMARY KEY REFERENCES ispatla_app.user_profiles(owner_user_id) ON DELETE CASCADE,
  x_user_id text NOT NULL UNIQUE
);
