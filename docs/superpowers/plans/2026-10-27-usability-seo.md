# Usability and crawl verification

Goal: preserve the existing product while simplifying navigation and draft editing, repair broken actions, and make the brand favicon and technical SEO independently verifiable.

Current state: correct repository `/home/borat/Projects/ISPATLA`, baseline `0b87e6e`. Existing dev-generated `next-env.d.ts` changes are preserved. No product edits were made in the incorrectly supplied onur.af workspace; its temporary audit was removed and its fixture stopped.

- [x] Keep one stable, crawlable brand favicon; remove client-created data-URL duplicates. Check actual PNG dimensions and brand bytes, metadata, robots accessibility, rendered response and browser DOM.
- [x] Add an executable HTTP SEO gate across all 20 locales, including canonical/hreflang consistency with sitemap, robots, crawlable images, real 404s and private-page indexing boundaries. Add mutation tests proving bad pages fail. Run it against the production build and wire it into CI.
- [x] Make nested navigation reachable without detouring through parent pages; dismiss the mobile menu after navigation; make keyboard search order follow visible groups and keep the active result visible.
- [x] Separate draft creation inputs from the saved draft editor, put optional source/history/evaluation behind native disclosures, and prevent unsaved text being silently replaced or shared as stale saved content. Fix rejected fetches leaving the editor stuck.
- [x] Run focused regressions, complete tests, localization, lint, strict types, production build and local browser checks. Record actual results and external limits.

Constraints: no redesign or new dependencies; preserve 20 locales, RTL, brand assets, 𝕏 mark, AI cost and publication approval boundaries. Local fixture data only; no real publishing, provider requests or deployment. Search Console display and Google's recrawl remain external observations and must not be claimed from a local pass.

Research: joshbuchea/HEAD and garmeeh/next-seo (upstream project documentation), checked against installed Next.js docs and Google Search Central favicon, site-name, hreflang and robots guidance. Reuse native metadata; do not install an SEO plugin or add ranking promises, fake reviews, keyword stuffing or artificial freshness.
