# Campaign Landing Implementation Plan

> **For agentic workers:** Use scoped parallel Luna workers as explicitly requested by the owner. The owner directed completion of the landing; no additional design questionnaire is needed.

**Goal:** Deliver a polished customer-facing ispatla.tr landing around multi-account campaigns, AI, growth visuals and MCP.

**Architecture:** Server-render all marketing copy and navigation. Isolate the illustrative campaign panel as a client component. Use a typed locale record and local SVG charts without adding dependencies or calling providers.

**Tech Stack:** Existing Next.js 16.3.2, React 19, TypeScript, Tailwind 4 and Bun.

**Spec:** ../specs/2026-10-25-campaign-landing-design.md

## Global constraints

- Brand is `ispatla.tr`; use the exact `𝕏` mark.
- All twenty existing locales; localized URLs and RTL.
- Preview data must be visibly illustrative; approval mode is a preview choice.
- Keep the existing local font/mark and preserve pre-existing changes.
- No backend expansion, live posting, deployment or invented metrics claims.

## Review focus

- Long translated text at 320px: wrapping without page overflow.
- Keyboard-only preview selection and native FAQ: clear focus and selection state.
- JS disabled: core copy, preview baseline and conversion links remain present.
- Anonymous/no database configuration: landing still renders without private data.
- MCP claims/setup: local session-based tools, never a fictitious hosted integration.

## Tasks

- [ ] Typed copy in `src/i18n/campaign-landing*.ts`: primary tr/en and eighteen translations. Verify locale coverage and distinct translated content.
- [ ] `src/components/landing/campaign-preview.tsx`: period switching, SVG growth chart, three account rows, optional individual/bulk review preview. Test finite plots, visible sample label and localized control labels.
- [ ] `src/components/landing/campaign-landing.tsx`, `src/styles/campaign-landing.css`, `src/app/page.tsx`: customer-focused page, SEO and CTA integration. Check all locale markup and anchors.
- [ ] `src/app/docs/page.tsx`: localized MCP setup/help target. Reuse actual stdio invocation and documented environment-variable name without exposing a real credential.
- [ ] Retire unreferenced old landing components/copy/tests once the dependency graph proves safe; update design/status documentation rather than delete historical evidence.
- [ ] Verify focused tests, complete test suite, lint, typecheck and build; browser-check Turkish/English desktop/mobile and RTL, preview interactions, native FAQ, and signup/docs links.

Workers own separate files; the parent owns page composition, styling, integration, cleanup and final verification.
