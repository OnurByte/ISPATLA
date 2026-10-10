> Son logo düzeltmesi: Mevcut logo ve logo yazı fontu aynen korunur. Yeni tasarım dili logo işaretini değiştirmez.

> Latest user direction: no comparison section and no SuperX product content. Hero uses a synthetic X growth desk. Paper/carbon/cobalt theme applies globally. The original logo and its wordmark font remain unchanged.

# Signal Press implementation and evidence status

This register follows the approved 9 October 2026 master plan. Status is based on
files and local checks in this checkout; it is not a production deployment report.

| Phase | Acceptance scope | Status and remaining evidence |
|---|---|---|
| P0 Product identity | Editorial hero, tokens, open-source manifesto, labelled synthetic examples, mobile/reduced motion and full 20-locale copy | Design direction, localized landing copy and locale-aware metadata are implemented. Language is selected by cookie or `Accept-Language` on flat paths; each public path has one canonical URL and sitemap entry. The same URL cannot provide 20 separately addressable language variants, and crawlers may not retain or request each visitor language, so independent indexing of every translation is not guaranteed. Earlier checks of locale-prefixed URLs are historical and do not verify SEO behavior under the flat-path strategy. Landing and synthetic demo are implemented. Keyboard selection and original logo font were checked in the browser. Theme toggle was verified with distinct light/dark computed backgrounds; the 320px layout has no horizontal overflow. |
| P1 Interactive experience | Source → decision → draft → proof demo, keyboard operation, performance | Source selection, score/reason changes and revision diff are implemented; keyboard source selection was verified. All proof states explicitly retain synthetic qualification. |
| P2 Competitive intelligence | Xpatla research with dated evidence, state labels and corrections; comparison removed | Research protocol and dated starting snapshot documented. Sources need rechecking at publication; The Xpatla research dossier is implemented in all 20 locales with allegations separated from established evidence. |
| P3 Transparency and launch | Product state, campaigns, shareable materials, accurate claims | Launch copy and original campaign assets are prepared. Transparency routes are implemented. External publication was not requested. |
| P4 Measurement | Landing → demo, demo → signup, landing → GitHub, open-source → docs, organic/referral, demo completion, signup completion, first meaningful action and time to action | First-party daily aggregate endpoint covers named client-side events and coarse source groups. Signup totals and first retained draft timing are derived at report time from existing account/draft data, with no analytics identity table. Attribution and unique conversion rates remain unavailable. |

## Measurement contract

`POST /api/landing-events` accepts only `{event,page,source}` with one of the
six events, two approved pages (`/` and `/open-source`), and a source category
in `src/lib/landing-measurement.ts`.
The client entry point is `trackLandingEvent(event, page)` from that module.
Events are `landing_view`, `demo_start`, `demo_complete`, `signup_click`,
`github_click`, `open_source_docs`. The comparison section was removed by user request; `/open-source` is a separate manifesto page. The API stores only
day/event/page/source-category counters in Supabase PostgreSQL. It does not persist
IP, user agent, cookies, user IDs, raw referrer URLs, query strings or a visitor
identifier. The browser reduces `document.referrer` to `direct`, `x`, `github` or
`other` and sends only that allowlisted category; raw referrer URLs never leave
the client. Unknown fields are rejected, requests require a matching same-site
Origin, buckets expire after 400 days, and each count saturates at ten million.

These are event totals, not unique people. A client can omit, repeat or forge
events and referral groups can be omitted or forged; client counters cannot
connect a landing view to a signup. Server-side
signup totals and time from account creation to the first retained saved draft
are calculated as aggregates from existing Better Auth user and draft rows at
report time. No per-user analytics marker is created. This is a current database
snapshot: deleted drafts cannot establish earlier activity, and account/draft
retention changes the result. The report groups elapsed time into coarse buckets.
These totals cannot join anonymous landing views to signed-in actions; report
them as separate totals and timing distributions, not attributed conversion.

## Evidence still required

- Route and interaction proof in a real browser, including no-JavaScript content,
  keyboard flow, reduced motion, narrow widths and failed/empty demo states.
- Current-source verification for competitor claims immediately before launch.
- Production database persistence and retention behavior under the deployment
  operator's configuration.
- Review of the query-time signup and first-retained-draft report against an
  isolated database fixture, including deleted/empty draft cases.
- Confirming that a saved draft is the product's first meaningful action.
- Lighthouse, accessibility and Core Web Vitals measurements; targets in the
  approved plan are goals, not verified results.
- External post/publish confirmation; none is claimed here.

## Local verification (9 October 2026)

- Full suite: 389 tests passed, no failures (75 files).
- Live HTTP checks from the earlier locale-prefixed URL strategy are historical; they do not establish current flat-path canonical, sitemap or crawler-language behavior.
- BrandLogo has no diff from the original component; the original locally shipped brand font remains in use.
- Landing scroll behavior is smooth in the browser; OS and stored reduced-motion overrides remain authoritative.
- Leaderboard uses AppShell for authenticated sessions and PublicHeader for anonymous visitors; five leaderboard tests passed. Authenticated browser proof still requires a signed-in session.

- Final OG check: all 20 localized PNGs returned 1200×630; Arabic/Urdu/Devanagari shaping regression test passed, and Arabic word order was visually inspected.
- Desktop and mobile browser screenshots are saved under `/tmp/ispatla-proof/`.

- Final integration: production build, lint and typecheck passed. Focused final suite: 19 tests, 893 assertions, zero failures.
- Smooth anchor interaction reached `#signal-detector` with 32px section clearance. Dark cost fields were verified with dark background and pale text.
