# V3 implementation evidence

Contract: [ISPATLA_MASTER_PLAN_V3.md](ISPATLA_MASTER_PLAN_V3.md). The full V3
scope remains the active goal. A local gate or a phase exit does not mean launch
acceptance is complete.

## Supabase/PostgreSQL cutover (2026-10-10)

SQLite runtime, driver, type shim, database files and demo seeder have been
removed. Runtime persistence now uses Drizzle ORM with `pg` against Supabase.
The connected project has nine applied migrations and 86 `ispatla_app` tables;
they are empty because no legacy data was copied. Local migration version
prefixes now match the nine remote history entries. Historical SQLite checks below
describe the old runtime and are not PostgreSQL or production proof. Manual
source scans now read and score bounded owner-selected sources, but the former
draft/evaluation pipeline and scheduled source monitoring remain disabled. Queue
and publication approvals persist in PostgreSQL; outbound X writes remain
fail-closed until their full policy and evaluation gates are ready. Supabase is
active and its SQL connector works, but the `DATABASE_URL` values in `.env` and
`.env.production` are malformed: they lack username, password, `@`, numeric port,
and database path, so the app receives `ERR_INVALID_URL`. The Supabase Connect
panel's complete Transaction Pooler URI is required; public REST keys are not DB
credentials. A current direct grant check shows `anon` and `authenticated` have
no `USAGE` on `ispatla_app` or table privileges. Supabase's table-list tool still
reports RLS disabled on all 95 app/auth tables; add RLS and policies before
granting/exposing these schemas through the Data API. The Vercel environment read
is denied for the currently connected scope.

## Working tree and baseline

Work continues on `codex/ispatla-v3`. Existing source-reset changes in config,
source routes/components, DB, pipeline and sources are user-owned and preserved.
The untracked `x-use/` tree predates this work; it must not be deleted as an
unrelated directory cleanup. Product runtime transport cleanup is complete; historical migration metadata is kept separately.

Baseline: 192 tests passed; typecheck and production build passed. Lint had one
pre-existing unescaped apostrophe error and three warnings. The apostrophe is
fixed; the warnings remain. Pure scoring output is frozen in
[evidence/phase0-scoring-snapshot.json](evidence/phase0-scoring-snapshot.json).

## Phase status

| Phase | State | Evidence or remaining exit requirement |
| --- | --- | --- |
| 0 Baseline and correctness | Local exit verified | Intent-attempt lineage fixed and regression/upgrade fixtures pass. Full integrated run: 249 tests passed; build passed. Real isolated worker heartbeat and release verified. |
| 1 Better Auth and ownership | Security integration | Real Better Auth 1.7.7 sessions, two-user DB/API/MCP isolation and revocation pass. Node production-process public/private login journey passes. Reviewer findings contained: user-owned accounts cannot dispatch via shared legacy X credentials, deployment AI keys restricted, operator pages guarded. Regression and final review ongoing. |
| 2 X PKCE and explicit consent | Local core verified | Eight isolated OAuth cases cover multiple accounts, replay/session mismatch, scope checks, rotation, rollback and owner collisions; real-session route isolation and safe UI projection pass. Live X grant remains unverified. |
| 3 Refresh concurrency | Local core verified | Twenty simultaneous refresh calls invoke one fixture refresh; version CAS and disconnect/reauth fencing pass. Live provider refresh remains unverified. |
| 4 Durable jobs | Local integration verified | Per-job/intent/account leases, heartbeat, once-only markers, backoff, DLQ, SIGKILL and distinct-job account-budget fixtures pass. Live provider/runtime acceptance remains separate. |
| 5 Official publisher | Local integration verified | Official client fixture tests cover post/repost/media/eligible reply and safe errors. Local publisher/intent/queue tests pass. Manual live test account smoke remains unverified. |
| 6 Dispatch and reconciliation | Local integration verified | Intent and queued post/reply/repost official evidence fixtures pass; account serialization and persisted in-flight/unknown budget history prevent repeat sends and budget races. Live X smoke remains unverified. |
| 7 Legacy transport removal | Local verified | Product source/scripts/tests/README contain no legacy transport references. Migration 24 archives receipt metadata before dropping columns and quarantines historical intents; repeat upgrade fixture passes. Demo needs no browser cookies/X credentials; clean-clone delivery still pending. |
| 8 Deterministic X policy | Local integrated core | Shared policy reads current consent, durable history and owner-scoped CAS/audited account/category/action kills at final send. Replies record authenticated official author mention/quote evidence; unverified evidence denies. Broader abuse corpus, control UI and global duplicate coordination remain. |
| 9 Public/private product shell | Local shell verified | Public docs/security/privacy/usage pages, design register and creator card exist. Local HTTP 200, narrow-screen no-overflow measurements and keyboard focus are observed. Reduced-motion rules are implemented but not emulated; complete accessibility/hosted acceptance remain. |
| 10 Shadow-first onboarding | Partial | OAuth metadata/Observe-first consent and truthful first-opportunity CTA exist. Full configured first-draft/manual-live-publish journey remains. |
| 11 Approval, queue and recovery UX | Local safety integrated | Immutable complete approval snapshots bind revision/text/account/action/source/media, expire after 15 minutes for sourced work or 24 hours for standalone originals, and are rechecked atomically at claim/send. Expired work requires a new approval; audit-linked drafts cannot be hard-deleted. Expiry deadlines, fresh-approval actions, draft review links and uncertainty warnings are integrated; a complete browser recovery journey remains. |
| 12 Event/Claim/Observation | Shadow intake integrated | Shared intake and metric refresh persist immutable X observations and nullable revisions. Existing candidate keys group events; no guessed similarity threshold/stable author IDs/references. Claim UI/automatic verified claim extraction remain. |
| 13 Emergence/lifecycle | Shadow core implemented | Robust baselines, broadcast/cascade distinction and backtests. |
| 14 Reputation/corroboration | Shadow core implemented | Topic shrinkage, independent evidence and coordination discount. |
| 15 Account fit/AI routing | Shadow core implemented | Per-account suitability and format recommendations carry evidence, fatigue, quiet-hours, best-hour, and capability/rights gates; recommendation risk stays unknown and consent false. Scheduler timing, full purpose routing, and live publisher acceptance remain. |
| 16 EIR shadow evaluator | Partial | Baselines use owner-scoped mature official X outcomes only. Untrained residuals stay null and mode remains cold-start even with samples. Full trained account-relative residual/challenger model and live outcome journey remain. |
| 17 Calibration | Local core verified | Calibration and holdout count each leakage group once; contradictory labels are excluded. Tied-score isotonic fit, calibration-only fitting, holdout-only Brier/log-loss/ECE/reliability and nullable insufficient evidence remain. Live label collection, maturity scheduler and complete product acceptance remain. |
| 18 Missed-hit observatory | Partial; PostgreSQL port incomplete | Historical candidate decisions/reasons and immutable human classifications are documented by the former runtime. The PostgreSQL source scan currently stores bounded observations only; candidate evaluation and reason persistence are not yet connected. |
| 19 Holdout/exploration | Shadow intake not yet wired to PostgreSQL scan | Evaluation primitives remain, but the current scan does not record owner/account reject/skip/eligible decisions before Jev/publishing. Historical backlog, challenger replay and manual exploration remain. |
| 20 Earned autonomy | PostgreSQL evidence store; send disabled | Proposal, confirmation, and demotion APIs use owner-scoped PostgreSQL state. Confirmation locks and revalidates the enabled account/category mapping and evidence in one transaction. The outbound send path remains fail-closed pending full pipeline and live database/provider verification. |
| 21 OSS release | Local partial | AGPL-3.0-or-later license, contributor/security/conduct/architecture/changelog docs, issue forms, .env.example and disposable demo adapters exist. Real local demo login/draft page HTTP smoke passes with official requests disabled. A source snapshot install passes; real committed clone, GitHub security/labels setup and remote release remain. |

## Proof boundaries

`tests/phase0-runtime.test.ts` records historical evidence from a real finite
worker against a disposable SQLite file with scheduled provider tasks disabled.
That old-runtime check is retained as provenance; it does not prove the current
PostgreSQL worker, configured live DB, provider, domain, production deployment
or X publishing.

Phase 0 metrical evidence preserves canonical nested metrics and null missingness
in raw/snapshots. Legacy scoring columns still use numeric lower bounds; full
V3 missingness in score/baseline/feedback remains an explicit later audit item.

No production X write, live OAuth grant, email provider delivery, CI, push,
merge or deployment has been claimed or performed in this evidence record.

## Phase 1 process evidence

A production-build Next process running on Node against disposable SQLite returned
public landing 200, anonymous `/app` redirect 307, signup/signin 200, authenticated
accounts API and page 200, hostile mutation origin 403, and signed-out cookie 401.
The smoke used a private-beta auth configuration and no email/X/provider writes.
Its temporary process and database were removed afterward. This proves the local
Node runtime boundary, not live HTTPS or delivery.

User-owned automatic generation/publication uses official per-account credentials and
explicit consent inside the persisted owner context. Global radar remains shared.
No operator-cookie fallback is permitted for user-owned dispatch.

## Current integration checkpoint

The full V3 objective remains active. Review findings on draft edits after a
remote marker, missing official reply evidence intake, and caller-asserted
autonomy counts were reproduced and corrected. Store tests run in isolated
processes to prevent module-cached SQLite paths from contaminating other suites.

Demo HTTP smoke: real Next dev process with a separate .next-demo directory,
login 200, owner draft API 200, rendered draft page 200, external writes zero.
The first demo launch found the existing development lock; it was preserved.
The isolated demo process and temporary database were removed after the smoke.

Current full-suite checkpoint: `bun test` passed 307 tests across 53 files
(1608 assertions; isolated child store regressions also pass). Typecheck and
production build passed. Lint has zero errors and three existing UI warnings.
The account-fit lane now rejects legacy source-feedback as account performance
evidence; the draft evaluator uses mature official outcomes and leaves residual
predictions null until a model is trained. Calibration deduplicates leakage
groups and drops conflicting labels. A deterministic final-marker regression
adds an incident after authorization capture and confirms the write marker is
denied. A fresh production-build Node process verified public/private auth
pages, the evaluation workspace render, owner API, hostile Origin 403 and
signed-out cookie 401. An independent read-only review found no issue in the
new calibration, draft baseline, or atomic incident guard. No external
provider writes occurred. See evidence/evaluation-core.md for remaining
calibration and autonomy limits.

A clean temporary source snapshot (excluding ignored secrets, runtime state,
dependencies and the pre-existing untracked vendor tree) passed frozen-lockfile
installation and demo seeding without provider credentials. This is source
snapshot proof, not a Git clone of committed/remote changes. Temporary files were
removed. The latest focused review also found omitted draft source provenance;
source ID/handle/URL now join revision snapshots, with a regression check.

Current integration also verifies finite complete approval snapshots and final
SQL consent/grant/scoped-autonomy checks. A fresh Node production process
rendered the expired queue with HTTP 200, created a distinct pending approval
with HTTP 201, and preserved the old expired record. Public trust pages returned
200; auth/session/Origin checks remained intact. Provider writes were zero.
The parallel account lease regression passed five consecutive runs. A fresh
read-only reviewer found no current regression in the integrated paths.

Next requirements: full purpose/risk/cost routing; missed-hit/challenger replay
and historical intake backfill; trained residual evaluation; complete manual
live publish and recovery journeys; reduced-motion/accessibility acceptance;
and live X/email/production and remote release proof. The current environment
has no X OAuth or mail provider credentials, so those live gates remain
unverified. Unknown production risk stays fail-closed. No completion claim for
full V3.
