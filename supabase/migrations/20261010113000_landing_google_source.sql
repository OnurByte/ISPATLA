ALTER TABLE ispatla_app.landing_event_daily
  DROP CONSTRAINT IF EXISTS landing_event_daily_source_check;
ALTER TABLE ispatla_app.landing_event_daily
  ADD CONSTRAINT landing_event_daily_source_check
  CHECK (source IN ('direct', 'google', 'x', 'github', 'other'));
