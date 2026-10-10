-- User-owned competitor watchlists; competitor collection is a separate worker concern.
ALTER TABLE ispatla_app.competitors DROP CONSTRAINT IF EXISTS competitors_handle_key;
ALTER TABLE ispatla_app.competitors ADD COLUMN owner_user_id text NOT NULL REFERENCES ispatla_auth."user"(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS competitors_owner_handle_unique ON ispatla_app.competitors(owner_user_id, handle);
