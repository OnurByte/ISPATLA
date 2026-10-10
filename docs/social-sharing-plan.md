# ISPATLA Public Proof & Social Sharing Roadmap

Scope: active public X observation pages (/h), public X-linked profiles, leaderboard, Open Graph metadata and sharing. Exclude all legacy public/campaign content.

## Principles

- Observation is NOT a verified hit. Official X metrics, evaluation predictions, and leaderboard classifications must remain separate.
- Share links are opt-in and revocable. Missing/revoked public evidence must return 404, including its OG image route.
- Never expose private account history, drafts, tokens, or unapproved X media in public metadata. Unknown X metrics remain unknown.
- Link previews must render from server HTML, without client JavaScript, and have public absolute HTTPS image URLs.
- Social platforms can cache previously fetched images after revocation. Explain this limitation near share controls.
- No automated posting to X, Discord or any other platform.

## Phase 1 — foundation (this PR)

- [x] Absolute metadataBase and explicit OG crawler allowance for /api/og while preserving API restrictions.
- [ ] Public /h share metadata with canonical URL, OG image, Twitter summary_large_image and accurate official-observation wording.
- [ ] Dynamic public profile and leaderboard social cards with local multi-script fonts.
- [ ] Share actions (X, Facebook, WhatsApp, Telegram, copy link, download image) on voluntary public share pages.
- [ ] Tests for URL encodings, image metadata, scripts, null metrics and robots.

## Phase 2 — preview lab

- [ ] Internal multi-platform preview panel inspired by jakejarvis/react-og-preview (1 star at research time).
- [ ] Crawler validation, missing tag warnings, social image dimensions, image KB budget and staging vs production comparison inspired by dhanushk-offl/prevu (5 stars).
- [ ] Detect crawler requests and exclude them from human click analytics.
- [ ] Test long non-Latin text, Arabic/Urdu RTL, CJK and mobile previews across all 20 supported locales.

## Phase 3 — validated proof cards

- [ ] Keep a separate server presentation model for public observations, consented verified leaderboard hits and immutable prediction-vs-outcome comparisons.
- [ ] Never infer hit status from impressions; reuse the existing rankLeaderboardEvidence baseline and official data requirements.
- [ ] Export multiple clear visual formats from the same authoritative snapshot (wide social card, compact image, receipt).
- [ ] Human referral and registration attribution with privacy-preserving aggregates and without counting crawler fetches.

## Phase 4 — experimental richer embeds

- [ ] Evaluate authorized video/media metadata as a controlled experiment; fallback to a regular image card.
- [ ] Consider a Discord app for interactive embeds (normal OG metadata cannot provide buttons).
- [ ] External URL unfurling needs complete redirect/DNS SSRF protection and outbound fetch rate limits.

## QA gates

- 404 and no metadata/image leakage after public share revocation.
- Official API source and observation timestamp accompany public X values; null metrics are never converted into zero.
- Every public preview route returns suitable content type and reachable image. Existing private /api endpoints remain robots-disallowed.
- The live client previews are verified separately: HTML tags do not control platform cache invalidation.

## Niche code references (ideas, not dependencies)

- https://github.com/arfct/link-previews (crawler-aware share-link service, 0 stars)
- https://github.com/jakejarvis/react-og-preview (platform preview UI, 1 star)
- https://github.com/dhanushk-offl/prevu (local/staging metadata validation, 5 stars)
- https://github.com/dokalldotcom/link-preview (oEmbed fallbacks; audit SSRF safety, 3 stars)
- https://github.com/shi-gg/bluesky-media-worker (media-type-specific metadata; platform-dependent, 2 stars)
- https://github.com/smartperson/peertube-embed-proxy (experimental video embedding; review license, 0 stars)
