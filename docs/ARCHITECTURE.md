# Architecture

Next.js renders public entry pages and authenticated `/app` pages. Better Auth
uses the same SQLite file as domain data. Request wrappers resolve a real
session and establish the owner context before private data is read or mutated.
Operator-only shared administration has a separate explicit guard.

X sign-in uses OAuth PKCE and `/2/users/me` to authenticate the application
user and bind the same X account for workspace use; there is no second account
connection step. Encrypted credentials, refresh leases and per-action consent
live in separate tables. Official X requests use that persisted account
binding. Automatic publication still requires workspace preferences and
explicit publishing consent.

The verified X account supplies the profile name, bio, handle and locally
stored avatar. New profiles start with Public selected in onboarding and are
not publicly visible until that choice is saved. Existing visibility choices
remain unchanged. Public profiles use `/handle`; reserved application paths
retain an opaque `/u/` link. Private profiles and their avatar endpoints remain
owner-only. Profile visibility does not publish drafts or enroll hit cards.

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
