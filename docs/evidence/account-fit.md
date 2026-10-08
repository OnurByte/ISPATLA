# Phase 15 account fit and format choice

The pipeline now records a deterministic per-account suitability score and a
format recommendation alongside the existing shadow decision. The score uses
configured category weight, presence of the account's stored voice profile,
and current category publication count. It suppresses recommendations when
the account or category daily budget is exhausted. Its initial weighting (category weight
multiplied by 20, voice-profile availability at 70, and 25 points per recent
category publication subtracted from fatigue) is an uncalibrated ranking
rubric, not a measured model. Format history comes only from eligible,
owner-scoped evaluation predictions with mature official X outcomes, an exact
account/remote-post provenance match, and the same category and actual format.
It deduplicates by remote post, requires non-null views greater than zero and
all four engagement metrics, and divides their sum by views. Legacy
source-feedback snapshots do not enter format recommendations. At least five
valid samples are required; otherwise the chooser uses a capability-safe post
fallback. If evaluation history cannot be read, sample count remains null and
the fallback reason records unavailable history. The separate draft evaluator
still uses its existing baseline and is not the source of format recommendations.
Its `confidenceBasis` names the evidence available and is not a probability.

The separate draft evaluator now reads baseline rows only from the same
owner-scoped predictions and mature official X outcome records. It no longer
falls back to legacy source feedback. The residual prediction remains null and
the draft remains in cold-start mode until a fitted residual model and its
calibration are available; a sample count alone does not turn a rubric into a
prediction.

The chooser considers post only when the account has the post capability and
the event cluster has not already been published for that account. It
considers repost only when capability, cleared source rights, and the existing
cluster duplicate check all permit it. Reply requires an official audited
summon for the exact numeric target. Quote is recorded as denied while
entitlement remains unknown. Every recommendation carries `riskTier: unknown`
and `publishConsent: false`; it does not authorize publication or change the
existing publisher path.

Source fatigue counts only confirmed publications from the same account and
source in the preceding 24 hours using owner-scoped publication policy history.
If that read fails, the count stays null; an available empty history is recorded
as zero. Quiet hours are read only from a strict
`postingSchedule.quietHours` object already present in account style JSON or the
account/category style override, with `start`, `end`, and an explicit IANA
`timeZone`. Invalid configured windows fail closed in the recorded timing
predicate. Missing configuration leaves the window unknown and no timezone is
invented.

Best-hour suggestions use only owner-scoped, eligible post predictions with
official X outcome revisions whose provenance includes the confirmed post's
published timestamp. The latest revision per remote post is used after a
14-day maturity period; each local hour needs five non-null view outcomes.
History is bounded to the newest 500 predictions per account. Missing or
immature evidence leaves the best hour null. This adds shadow evidence only;
it does not schedule or dispatch a post.

Focused fixtures cover a single event producing different account/format
choices, reply and quote denial, and unknown risk retaining no publish consent.

Phase 15 remains partial: account/purpose AI route behavior is still the
existing route implementation, and the timing recommendation is not wired into
the publication scheduler. Live publisher behavior and the full Phase 15 exit
are not established by these unit fixtures. Residual forecasting remains
disabled until it has a trained model and calibration evidence.
