CREATE SCHEMA IF NOT EXISTS ispatla_app;

CREATE TABLE IF NOT EXISTS ispatla_app.user_profiles (
  owner_user_id text PRIMARY KEY REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_-]{24}$'),
  display_name text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  x_handle text,
  avatar_url text,
  onboarding_completed boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_x_handle_lower_unique
  ON ispatla_app.user_profiles (lower(x_handle)) WHERE x_handle IS NOT NULL;
