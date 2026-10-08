# Architecture

Next.js renders public entry pages and authenticated `/app` pages. Better Auth
uses the same SQLite file as domain data. Request wrappers resolve a real
session and establish the owner context before private data is read or mutated.
Operator-only shared administration has a separate explicit guard.

X identity comes from OAuth PKCE and `/2/users/me`, separate from application
login. Encrypted credentials, refresh leases and per-action consent live in
separate tables. Official X requests use that persisted account binding.

A shared radar reader appends provenance and nullable metric revisions to the
X-only event store. Account decisions and drafts run inside their owner's
context. The original heuristic score remains a decision score; calibration
uses labeled calibration groups and evaluates separate holdout groups.

Publication intents and queue jobs reserve durable leases plus an account
lease. The final policy check reads current consent, persisted history and kill
controls before a once-only request marker. Acceptance is pending reconciliation.
Unknown writes remain quarantined. Confirmation requires authenticated author,
text, target and bounded-time evidence; repost confirmation requires positive
connected-user evidence.

Draft content changes append immutable revisions and invalidate unsent approvals
and jobs atomically. A marked unresolved write fences edits until reconciliation.
Demo uses a disposable database and synthetic adapters; official requests and
publication are disabled. Simulated receipts never enter remote confirmation.

See V3_IMPLEMENTATION_STATUS.md for unfinished integrations and proof boundaries.
