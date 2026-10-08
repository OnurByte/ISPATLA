# V3 phase 15–19 shadow ingestion evidence

The scan records one owner-scoped prediction per candidate, account, category,
and scan timestamp before Jev ranking or the publishing loop. The bounded intake
is the source posts returned by the current scan, unioned with the current selected
candidate pool (up to 32 per owner); decisions outside the publisher's existing
top-six diverse batch are recorded as skips. Older historical candidates outside
this lane remain for a future replay/backfill. Each decision has
an immutable timestamped decision ID and a separate stable source-candidate ID;
the model version/category key stays stable across scans. It records eligible,
rejected, and skipped decisions, including the gate reason. Observe accounts do
not need automatic consent to accumulate evidence. The shadow path uses the
existing deterministic opportunity decision score as a numeric score; it does
not treat that value as a probability. Propensity and risk tier remain unknown
(`NULL` and `unknown`) until there is evidence to support them. Leakage-group
holdouts are tagged `manual_review_holdout` for a future review queue; the tag
does not dispatch or publish the candidate.

The leakage group is the existing stable cluster key, with the source post ID as
the fallback. Account-relative baseline, residual, and percentile features use
prior human-labeled non-holdout decision scores for the same account and category,
excluding the current leakage group. With no such history, those values remain
null and the sample count is zero.

The scheduler collects due outcomes only for eligible decisions matched to a
confirmed publication intent, persisted receipt or URL, and immutable approval
snapshot bound to the same account and source candidate. The owner-scoped query
filters for eligible, unlabeled, outcome-free, mature matches before applying
its limit; rejected or unmatched backlog cannot hide later publishable rows. It
reads confirmed intents independently of legacy feedback milestones, so an
earlier feedback refresh cannot consume collector inputs. Collection waits
until 14 days after publication confirmation, then resolves the persisted receipt or URL
under that account's owner, reads the post through the official X API, and
accepts it only when the returned post ID and author ID match. Metrics remain
nullable; absent official fields are listed as censored. A prediction receives
one official publication snapshot, observed and captured at the API read time;
the post creation time stays in provenance. Source-post observations remain separate in
the shared event observation store. They are not automatically called hits,
copied into account-publication outcomes, or converted into labels.

The approval snapshot is the source-candidate binding for outcome attribution;
editing a draft's current source ID after approval does not rewrite that binding.
The current snapshot schema does not preserve the decision category, so when a
source candidate has multiple eligible pre-publication decisions for one
account, attribution selects the newest eligible decision across those
categories. Earlier decisions remain unresolved pending a future richer
approval-to-prediction link.

## Local verification

`tests/shadow-evaluation.test.ts` runs an actual fixture-backed scan and checks
that rejected Observe decisions include stale and below-threshold current-scan
posts while drafts, intents, and publish attempts remain at zero. Its isolated
official-read fixture verifies owner
isolation, exact author/post binding, zero-versus-null preservation, and metric
censoring, including collection after a legacy feedback milestone was recorded.
No provider write is performed.

Calibration metrics, probability naming, automatic outcome labels, and a
champion/challenger replay are not enabled here: the stored opportunity scores
are decision scores, and the label/outcome set does not yet support a sound
probability comparison or counterfactual selection replay.
