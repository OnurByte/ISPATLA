# Shape, spacing and slogan implementation plan

**Goal:** Unify surface/control geometry and related-content spacing while retaining the editorial brand and restoring the slogan in all locales.

**Architecture:** Use shared Tailwind radius tokens in globals.css and consume them in the custom landing styles. Keep semantic circles for avatars/progress and small radii for compact controls; use 8px controls, 12px surfaces, 16px outer frames. Normalize layout spacing to the existing 4px Tailwind unit with smaller optical exceptions for typography and borders.

**Tech Stack:** Next.js, React, Tailwind CSS, Bun.

- [x] Define shared radii and a semantic spacing vocabulary; unify landing preview and CTA geometry, then align public-page gutters.
- [x] Restore translated versions of “Algoritmaya tapma. İspatla.” in every locale; preserve source Turkish verbatim and keep product explanations in the intro.
- [x] Document research and limits: contour preference is not proof of a particular pixel radius; proximity research supports clear grouping, not a universal grid.
- [x] Run focused locale/SEO tests, lint, strict types and production build; inspect landing/docs/login on desktop and mobile before integration.

Validation: 258 tests passed, 9 opt-in database tests skipped; lint, strict TypeScript and production build passed. Final local Lighthouse mobile 94/100/100/100, desktop 100/100/100/100; additional 320px accessibility and SEO both 100. Navbar logo measured 48px with 28px wordmark on desktop in landing and docs.
