# First-value and MCP readiness review

**Checked:** 2026-10-25  
**Scope:** source-level review of onboarding, public account analysis, documentation, and MCP connection code. This is not a production smoke test.

## Onboarding path

| Step | Source evidence | State |
|---|---|---|
| Add a public X handle | `XConnectButton` posts a handle to `/api/accounts`; `linkPublicAccount` reads its public profile through `FxTwitterReader`. | Implemented in source. It is not X OAuth and does not establish account ownership. |
| Analyze the account | `linkPublicAccount` runs `analyzeLinkedAccount`, which reads the timeline through `FxTwitterReader`, computes account category suggestions and a voice profile, and preserves manual profile choices. | Implemented in source; depends on the third-party public-data reader and available account data. |
| Review the first opportunity | Onboarding now directs the final action to `/opportunities`. | Route link implemented; availability and quality of opportunities depend on prior source observations. |
| Create a first draft | The opportunity flow supports draft creation, with AI provider setup kept optional until AI-assisted drafting is needed. | Product path exists in source; no live account was used to validate it. |
| OAuth and publication | Handle-based account analysis does not require OAuth. The separate official OAuth path remains outside this onboarding change. | No claim that OAuth or production publishing was tested. |

A public handle is an input for public-data analysis, not proof that the signed-in user owns the account. The UI now states this distinction and describes OAuth separately. AI setup is no longer presented as a required technical setup task.

## MCP connection and permissions

- Local MCP is started by the repository's `bun run mcp` script and uses `ISPATLA_MCP_SESSION_COOKIE` (`src/server/mcp.ts`). This is a local stdio process.
- HTTP MCP is implemented at `/mcp` (`src/app/mcp/route.ts`). Its origin is derived from `BETTER_AUTH_URL`; OAuth discovery, client registration, authorization, token, revocation, and protected-resource routes are present under `src/app/.well-known` and `src/app/mcp`.
- OAuth consent is explicit and scopes are `read`, `drafts:write`, `analysis:write`, `publishing:prepare`, and `receipts:write` (`src/server/mcp-authorization.ts`). Tool authorization enforces the mapped scope. Pending publication preparation routes to human approval in the web interface; MCP does not itself publish.
- Code presence does not show that a specific remote deployment is configured, reachable, or production-ready. This review did not test remote OAuth, a client registration, or a live tool call.

## Evidence language

FxTwitter profile, timeline, post, and metric reads are third-party observations. They are not official X API confirmation. Scores are application calculations; model output is analysis. Provider acceptance, a locally stored state, or a simulated receipt alone does not establish that a post was confirmed remotely. No production deployment was accessed for this review.

## Checks

Focused onboarding/localization tests passed. The parent subsequently completed strict typecheck, lint and the production build after resolving concurrent landing changes. The full suite and isolated PostgreSQL/HTTP MCP integration results are recorded in [BRIEF_ACCEPTANCE.md](../BRIEF_ACCEPTANCE.md). Browser checks confirm editable drafts survive account/review-view changes and the landing/docs navigation uses the same header. This does not establish a deployed provider flow.
