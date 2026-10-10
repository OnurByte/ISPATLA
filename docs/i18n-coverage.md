# ISPATLA Translation Coverage Audit

Audit date: 2026-10-11. Supported locales: en, zh-CN, hi, es, fr, ar, bn, pt-BR, ru, id, ur, de, ja, sw, mr, te, tr, ta, vi, ko.

## Already translated into all 20 locales on main before this work
- Navigation, public landing, onboarding copy, locale picker and locale-aware URL routing.
- Public documentation, marketing, evidence/press content and related snippets.
- Some pages explicitly remain partly translated; the `status.partial` warning means exactly that.

## Newly covered in this branch
- Authentication: sign-in/sign-up headings, email/password labels, OAuth failure and password reset feedback.
- Public X observation evidence pages, public profiles, share buttons and OG/card wording.
- Official leaderboard tabs, methodology, score descriptions and privacy explanation.
- Voluntary X observation share settings, including leaderboard opt-in/opt-out and revocation notices.
- Locale-aware number/date formatting on covered public pages.
- Regression tests for 20 locale dictionaries and server-rendered UI copy.

## Important: coverage is still incomplete
The broader authenticated workspace remains partially hardcoded in Turkish; examples include dashboard cards and filters, source management, drafts, queue, analytics, key settings, account connections, profile editing and various service/API errors. They have **not** been translated in this branch. Do not describe all UI screens as fully translated until those areas are migrated to the same locale-aware key approach and tested.

## Technical rules
- Keep the same 20 `LOCALES` values as `src/i18n/config.ts`.
- Never silently use Turkish as a fallback for selected non-Turkish locales on newly converted surfaces.
- Test complete key parity for each locale and rendering of security-critical messages.
- Use `Intl.NumberFormat(locale)` and `Intl.DateTimeFormat(locale)` for displayed values.
- For RTL locales (Arabic, Urdu) preserve `html[dir=rtl]` and bidi isolation for X handles, URLs and numeric tokens.
- Source/user-generated post text is not translated; its original meaning remains unchanged.
- Continue a separate audit of the authenticated workspace and real native-speaker reviews before claiming site-wide readiness.
