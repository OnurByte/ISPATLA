CREATE SCHEMA IF NOT EXISTS ispatla_app;

CREATE TABLE IF NOT EXISTS ispatla_app.landing_event_daily (
  day date NOT NULL,
  event text NOT NULL,
  page text NOT NULL,
  bucket text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'x', 'github', 'other')),
  count integer NOT NULL DEFAULT 0 CHECK (count BETWEEN 0 AND 10000000),
  PRIMARY KEY (day, event, page, bucket, source)
);
