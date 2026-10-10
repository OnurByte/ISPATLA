# Event intelligence shadow model evidence

This lane uses a standalone X-only canonical store in Supabase PostgreSQL through Drizzle. It uses distinct `intelligence_*` tables without depending on a local database file.

`upsertXObservation` stores the first X post identity, author, timestamp, text snapshot, lineage, URLs/media/language, reader provider, and raw hash as immutable provenance. Re-observing that post appends a metric revision; nullable counts and explicit censored metric names remain intact. A later record that conflicts with first-seen author, content, creation time, or raw hash returns `immutableConflict: true` while preserving original provenance. The observation payload is explicitly X reader evidence; this layer does not fetch linked URLs or assert truth.

Events and normalized claims are distinct records. Claims can link observations as `supports` or `contradicts`, so two incompatible assertions can live under one event without collapsing into one truth value. Event merge/split operations run in PostgreSQL transactions and append audit records with reason, details, and time. Splits move selected observations and move claims only when all their linked evidence follows the split. Invalid membership requests throw and roll back.

The pure intelligence module includes:

- Robust per-metric median, MAD, and p90 baselines. Null and censored values are omitted, counted separately, and never converted to zero. Coverage and sample count determine a confidence class.
- Event lifecycle windows at 2m, 5m, 10m, 20m, 60m, 6h, and 24h; emergence is `null` unless a historical median/MAD baseline has at least five samples. The current lifecycle cutoffs and emergence blend are explicit shadow-policy values in version `event-shadow-v1`, not calibrated operational thresholds.
- X lineage-family grouping and conservative broadcast/cascade/coordinated/mixed/unknown labels. Shared repost/quote/conversation roots reduce independent-family counts. Coordination likelihood only uses supplied text similarity, time proximity, and author count; output documents missing account-graph, ordering, and external evidence. It never labels accounts as bots or claims factual truth.
- Source×topic Beta-prior shrinkage. Signals sharing an event family are capped at one effective sample, coordination likelihood discounts weight, and posterior confidence remains separate from posterior rate so one small source cannot dominate.
- Scoped semantic-threshold calibration keyed by model, language, category, and comparison kind. It requires minimum positive and negative labeled examples; sparse fixtures return `threshold: null` and `status: insufficient`. Any balanced-accuracy result is in-sample calibration evidence unless separately evaluated against a held-out labeled fixture.

DB-independent tests cover the scoring and validation algorithms (4 passed). PostgreSQL transaction persistence was not exercised because no `DATABASE_URL` was available. These APIs produce shadow data only; they do not publish, repost, or call a provider.
