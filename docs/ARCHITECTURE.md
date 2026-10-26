# Architecture ⁜ current product boundary

Updated 25 October 2026. Current source is authoritative; V3/V4/Signal Press plans are historical context. Current decisions are in [PRODUCT_STRATEGY.md](PRODUCT_STRATEGY.md).

## Runtime and ownership

Next.js renders public marketing/help pages and authenticated workspaces. Better Auth and Drizzle use PostgreSQL in separate auth/application schemas. Request wrappers establish the owner before private accounts, drafts, usage, grants or outcomes are accessed. Operator actions have a separate guard.

Public 𝕏 snapshots can share storage. That does not make a private account relationship, analysis or draft public. Account selection and market queries stay owner-scoped. The product's content source is 𝕏; GitHub hosts code and documentation.

## Accounts and sources

Users can add a public handle without OAuth. `account-link.ts` reads public profile/timeline through `FxTwitterReader`, binds the stable provider ID and runs bounded category/voice analysis. Missing evidence produces a partial state. Manual preferences survive reanalysis. Handle entry is not ownership; ownership uses a fresh, expiring identity-bound challenge.

Application 𝕏 sign-in is a separate PKCE flow in `auth.ts`, with callback `/api/auth/callback/twitter`. It keeps read-only scopes and stable provider identity, without persisting sign-in tokens. Its authenticated-user lookup is an explicit unresolved billing boundary. Email/password and legacy recovery remain separate paths.

`monitoring.ts` collects configured public sources. Normalization keeps provenance, observation times and nullable metrics. `account-fit.ts` and scoring/evaluation services explain app decisions. Heuristic or calibrated values are not X's ranking score or guaranteed reach.

`post-view.ts` joins bounded public content with owner-only analysis. Direct `/post/[postId]` links render a page; the parallel/intercepted route renders a modal. Stale content and unknown metrics have distinct states.

## Drafts and publication

AI/BYOK produces editable drafts. Revisions invalidate stale approvals/jobs; unresolved writes fence conflicting edits. Users can review individual drafts or several accounts together.

`publishing-preparation.ts` prepares user-operated Web Intent, manual receipt or native scheduling handoff. Opening a provider screen is not publication. Receipt observation binds author, immutable content/target and owner; public observation remains separate from official confirmation.

The shared `OfficialXClient` and account OAuth/refresh paths deny metered operations before network access in this release. No deployment flag or granted scope enables them. Prime entitlement and budget enforcement must exist before that invariant changes. Application sign-in remains the explicit exception above. [API inventory and tests](evidence/official-api-boundary.md).

Durable queue, leases, idempotency, consent and reconciliation controls remain. They do not authorize disabled transport. Unknown remote state never becomes automatic retry or confirmed success.

## MCP

Stdio revalidates `ISPATLA_MCP_SESSION_COOKIE` and establishes the owner. HTTP `/mcp` uses OAuth discovery, registration, PKCE, explicit consent, resource/audience-bound tokens, refresh rotation, expiry, revocation and admission limits. A bearer grant contains only approved scopes, not a global app session or X token.

Tools reuse analysis, drafts, sources, analytics and publication preparation. `confirm: true` cannot manufacture human approval, skip ownership or reopen the official API. HTTP/client and database behavior is verified separately from route presence.

## Marketing and measurement

Public copy and metadata support 20 languages including Arabic/Urdu RTL. Interactive marketing needs no login and does not present fabricated engagement as measured customer results. Method and evidence explanations live in help or optional disclosure.

Metadata provides canonical/hreflang, social images and factual application identity, without invented ratings. The daily event endpoint allowlists event/page/coarse referral categories without persistent visitor identity. `scripts/landing-report.ts` separately aggregates retained account and first-draft timing; it cannot attribute anonymous views to signups.

## Verification

Focused tests cover policy/state transitions. An isolated PostgreSQL fixture verifies migrations, isolation, receipts and MCP without production data. Build, typecheck, lint and browser/Lighthouse/SEO results are separate evidence. Live deployment, provider permission, mail, billing and real outcomes need dated records in [BRIEF_ACCEPTANCE.md](BRIEF_ACCEPTANCE.md).
