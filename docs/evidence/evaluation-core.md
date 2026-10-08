# Evaluation core evidence

The evaluation store records account-scoped candidate predictions, deterministic
leakage-group splits, append-only nullable outcome revisions, human labels,
calibration profiles, and holdout replays. Every account-specific write and query
resolves the account through `getAccounts()` while the verified owner context is
active. It stores no transport credentials and performs no publishing or queue
action.

Calibration fits isotonic mapping only from `calibration` labels and scores the
separate deterministic `holdout` split with Brier score, log loss, ECE, reliability
bins and Wilson intervals. Scores remain raw decision scores until a sufficiently
large calibration sample exists. Holdout evaluation returns `insufficient` and
null probability-derived metrics when no usable frozen profile exists.

Scoped autonomy remains disabled until a distinct owner-confirmation call.
Approval counts come from persisted confirmed publication intents joined to
immutable human approval snapshots, the verified owner/account, and eligible
matching action/category/`low` risk decisions recorded before approval. Later
classifications cannot backfill earlier approvals; worker approvals do not count. Caller-supplied counts,
unknown risk, and unmatched candidates do not count. Policy blocks, negative
evaluation labels, and recorded policy/auth/duplicate/unacceptable demotions
prevent promotion. Confirmation recomputes and compares the evidence hash
before enabling the exact `(account, action, category, risk tier)` tuple; changed
evidence rejects the old suggestion. Demotion disables that tuple and appends an
audit event with a reason. The publication and queue send boundaries now consume the exact confirmed
scope in addition to deterministic policy. Owner-scoped proposal, confirmation
and demotion APIs exist. Production shadow intake currently writes risk as
`unknown`, so it cannot qualify for automatic execution. The scope does not pin
a model version; every matching pre-approval decision must agree. Account-fit
and evidence-based risk classification, promotion UI, and a complete recovery
journey remain pending.

Focused checks: `bun test tests/evaluation.test.ts tests/calibration.test.ts`.
This is local SQLite/fixture evidence. Current scan decision ingestion and
authenticated due-outcome reads are described in shadow-ingestion.md; live
provider behavior and hosted acceptance remain unverified.
