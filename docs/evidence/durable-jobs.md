# Durable job lease evidence

Phase 4 adds persisted leases and an append-only event timeline for automation jobs and publication intents. Claims are serialized in SQLite and reserve an attempt while assigning a random lease token and expiry. Heartbeats, request-start markers, and finishes require the current unexpired token. A stale worker therefore cannot extend or finish a lease after it expires or is replaced.

Known safe failures schedule exponential retry with a capped delay and injectable jitter; attempt limits move jobs to `dead_letter`. Expired work that never crossed the remote-write marker may retry safely. Once `remote_write_started_at` exists, expiry becomes `reconciliation_required`, so an uncertain X send is never automatically repeated. The request marker is one-time for both queue types.

For publication intents, transport acceptance stores the receipt and any returned post identifiers while leaving status `pending_reconciliation`. `confirmPublicationIntentRemote({ id, now, remotePostId?, remoteUrl? })` is a separate evidence boundary; it can mark the intent confirmed only after dispatch has begun. This keeps provider acceptance distinct from observed remote publication.

Database APIs exported from `src/server/db.ts`:

- Automation jobs: `claimAutomationJobLease`, `renewAutomationJobLease`, `markAutomationJobRequestSent`, `finishAutomationJobLease`, `recoverExpiredAutomationJobs`, `getAutomationJobEvents`, `getDeadLetterAutomationJobs`.
- Publication intents: `claimPublicationIntentLease`, `renewPublicationIntentLease`, `markPublicationIntentRequestSent`, `finishPublicationIntentLease`, `recoverExpiredPublicationIntents`, `confirmPublicationIntentRemote`, `getPublicationIntentEvents`.
- `retryDelaySeconds` supports deterministic `random` injection for tests.

Verification: `bun test tests/durable-jobs.test.ts` covers lease fencing, retry timing and limits, dead-lettering, event history, concurrent process claims, and a child process killed after a synthetic side effect. The SIGKILL case then runs recovery and verifies quarantine with exactly one side effect. This is database-level recovery evidence; queue worker integration and provider behavior are outside this phase.
