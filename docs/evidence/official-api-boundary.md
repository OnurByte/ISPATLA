# Official X API boundary

Status: pre-Prime server gate implemented; local behavior covered by focused tests. This note describes repository code and current official X documentation checked on 25 October 2026. It does not claim behavior has been verified in a live deployment.

## Enforcement

`src/server/official-x.ts` is the shared client for official X data and publishing used by application services, the automation worker, and MCP tools. Its single private request path checks a server-side availability invariant before credential validation or the injected network fetcher. Availability is currently hard-coded false because the application has no Prime entitlement or budget enforcement. No environment variable, request parameter, stored OAuth grant, worker job, MCP tool input, or user approval can override the check. Calls fail with a typed `policy_blocked` error.

The gate remains closed until a real Prime entitlement and budget check exists. No product price, plan contents, API budget, or per-operation price is established by this change.

The PostgreSQL X OAuth account-authorization start, callback, and refresh paths are separately gated. They can establish or renew credentials used for official API access. The capability endpoint reports provider-granted scopes separately from effective İSPATLA capabilities; before Prime, scoped operations remain unavailable. The existing X sign-in flow is deliberately not gated; see the unresolved boundary below.

FxTwitter reads in `src/server/x-reader.ts` do not use this gate and remain unchanged.

## Official network paths found

| Code path | Official X request(s) | Classification and treatment |
| --- | --- | --- |
| `OfficialXClient` shared by account inference, profile sync, reply eligibility, publication, reconciliation, automation worker, shadow evaluation, and MCP | `GET /2/users/me`, `GET /2/users/:id/tweets`, `GET /2/tweets/:id`, `GET /2/tweets/:id/retweeted_by`, `GET /2/media/upload`; `POST /2/tweets`, `POST /2/users/:id/retweets`, and media upload initialize/append/finalize | User/post reads and publishing/media operations. All are denied before `fetch` in this release; configuration cannot enable them. The client applies this uniformly to reads and writes, including worker/MCP callers. |
| `src/server/postgres-x-oauth.ts` | `POST /2/oauth2/token` during connection; `GET /2/users/me` after authorization | Account authorization is denied before database or provider activity because the callback performs an official user lookup and creates a grant for gated operations. |
| `src/server/x-oauth.ts` | `POST /2/oauth2/token` for refresh; `POST /2/oauth2/revoke` for disconnect | Refresh is denied. Revocation remains available as credential cleanup after local disconnect; no claim is made here about provider billing for token operations. |
| `src/server/auth.ts` social sign-in provider | `GET https://api.x.com/2/users/me?user.fields=description,protected` | Explicit sign-in exception is preserved. The current X docs identify `/2/users/me` as the authenticated-user endpoint in User Lookup. The pay-per-use pricing docs list User Read as a billable resource class, but do not establish the exact billing treatment of this sign-in request. Therefore this flow is not described as free or cost-free, and its billing status remains unresolved. |

No other `api.x.com` or `api.twitter.com` request sites were found by repository search. FxTwitter, X status/media hosts, and unrelated providers are not official X API data/publishing calls.

## Capability response

`GET /api/capabilities` retains `scopes` and `xEntitlement`, and now distinguishes:

- `providerCapabilities`: operations indicated by stored granted scopes; quote entitlement remains `unknown`.
- `capabilities`: operations currently usable by İSPATLA, additionally constrained by the Prime gate and account connection state.
- `apiEnabled` and `unavailableReason`: effective API gate status (`false` and `prime_unavailable` while entitlement and budget enforcement are absent).

These fields describe code behavior. They do not verify a live account's X plan or prove that a deployment has Prime entitlement enforcement.

## Evidence and limits

- X's current pricing documentation states pay-per-use credit billing and says reads are charged per returned resource while writes/actions are charged per request. Endpoint-specific rates can differ, and current rates are in the Developer Console. It also lists User Read and Posts Read as billable resource classes: [X API pay-per-use pricing](https://docs.x.com/x-api/getting-started/pricing).
- X's User Lookup documentation identifies `GET /2/users/me` as the authenticated-user lookup: [User Lookup](https://docs.x.com/x-api/users/lookup/introduction).
- X documents the OAuth 2.0 code/PKCE and refresh-token flow separately: [OAuth 2.0 authorization code flow](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code).
- No numeric price has been copied into product code or used to infer the cost of a particular call. Rates can change.
- Focused local tests prove that setting `ISPATLA_PRIME_ENABLED=1` cannot enable official-client reads/writes, account authorization, or token refresh, and that denied calls do not invoke injected fetchers. Transport tests mock only the gate module inside their isolated test process. The sign-in provider test continues to exercise `/2/users/me` with read-only scopes. These mocks do not establish live provider billing or production browser behavior.
