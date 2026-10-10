CREATE SCHEMA IF NOT EXISTS ispatla_auth;

CREATE TABLE IF NOT EXISTS ispatla_auth."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ispatla_auth.session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON ispatla_auth.session("userId");

CREATE TABLE IF NOT EXISTS ispatla_auth.account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON ispatla_auth.account("userId");

CREATE TABLE IF NOT EXISTS ispatla_auth.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON ispatla_auth.verification(identifier);

CREATE TABLE IF NOT EXISTS ispatla_auth."rateLimit" (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  "lastRequest" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS ispatla_auth.auth_email_verification_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_email_verification_tokens_expiry_idx ON ispatla_auth.auth_email_verification_tokens(expires_at);

CREATE TABLE IF NOT EXISTS ispatla_auth.auth_signup_admission (
  key text PRIMARY KEY,
  count integer NOT NULL,
  window_started_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_signup_admission_expiry_idx ON ispatla_auth.auth_signup_admission(window_started_at);

CREATE TABLE IF NOT EXISTS ispatla_auth.auth_user_status (
  owner_user_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS ispatla_auth.auth_abuse_signup_signals (
  id text PRIMARY KEY,
  owner_user_id text,
  email_hash text,
  device_hash text,
  ip_hash text,
  created_at bigint NOT NULL,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'failed', 'success')),
  risk text NOT NULL CHECK (risk IN ('normal', 'review'))
);
CREATE INDEX IF NOT EXISTS auth_abuse_signup_expiry_idx ON ispatla_auth.auth_abuse_signup_signals(created_at);
CREATE INDEX IF NOT EXISTS auth_abuse_signup_email_idx ON ispatla_auth.auth_abuse_signup_signals(email_hash, created_at);
CREATE INDEX IF NOT EXISTS auth_abuse_signup_device_idx ON ispatla_auth.auth_abuse_signup_signals(device_hash, created_at);
CREATE INDEX IF NOT EXISTS auth_abuse_signup_ip_idx ON ispatla_auth.auth_abuse_signup_signals(ip_hash, created_at);
