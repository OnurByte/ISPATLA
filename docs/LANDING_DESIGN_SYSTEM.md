# The Signal Press landing design system

This visual direction is implemented on the landing and shared through the site theme. The original brand symbol remains, while Libron is the locally served site and wordmark font. See [the evidence register](SIGNAL_PRESS_STATUS.md) for verified boundaries.

## Art direction

Underground editorial meets an intelligence laboratory: independent print,
archival paperwork, measurement marks and original signal diagrams. Use an
asymmetric editorial grid with large quiet areas and deliberate line breaks.
Avoid generic SaaS cards, glass, blur, glow, gradient-heavy surfaces and abstract
3D spheres. The supplied campaign artwork is original SVG and uses no external
image or font service.

| Token | Value | Use |
|---|---|---|
| Archive paper | `#F0EDE5` | Main paper surfaces |
| Carbon ink | `#16191E` | Text and dark surfaces |
| Signal cobalt | `#315BF5` | Primary action and signal marks |
| Warm archive | `#9A9A91` | Secondary labels |
| Rejected | `#BC453D` | Rejected state, with text label |
| Verified | `#477865` | Verified state, with text label |

Libron is the only site font for interface text, editorial headings, the brand wordmark, measurement labels and code. Font files are served locally under the SIL Open Font License; no third-party font service is loaded at runtime.

## Page narrative

1. **Editorial hero:** “HERKES AKIŞI GÖRÜR. SEN SİNYALİ YAKALA.” Explain source
   research, opportunity assessment, editable drafts and evidence tracking. Link
   to discovery, source code and a demo only when that demo is reachable.
2. **Signal Detector:** clearly synthetic examples, source, decision and reasons.
   A decision score is not virality probability or observed performance.
3. **Writing Room:** show editable draft variants, account context and revision
   differences; preserve approval as the user's decision.
4. **Proof Room:** label `confirmed`, `unknown`, `blocked`, `pending` and `failed`
   in text. No success seal without confirmation evidence.
5. **Open-source manifesto:** repository, AGPL-3.0-or-later, self-host docs,
   architecture, contributions and limitations. Open source is not a hosting,
   API or AI cost promise.
6. **Evidence-led comparisons:** see [COMPETITOR_RESEARCH.md](COMPETITOR_RESEARCH.md).
7. **Editorial colophon:** identity, repository, license, docs, security/privacy,
   version evidence and creator signature.

## Localization and search

Ship complete landing copy and SEO metadata in all 20 required locales; do not
fall back to Turkish or English for an untranslated locale. Each localized page
needs its translated title, description, canonical URL and reciprocal hreflang
links. Keep structured data factual and localized, and never add Review or
aggregate-rating data without eligible evidence. Comparison pages cite dated
sources in every locale where exposed. Verify sitemap and robots coverage for all
20 locales, and test RTL rendering for Arabic and Urdu.

## Interaction and accessibility

All essential copy and links remain semantic HTML and work without JavaScript.
The demo is keyboard operable, announces state changes, uses visible focus, and
does not rely on hover. Preserve 44px minimum action targets and avoid horizontal
overflow at 320px. Honor reduced-motion preferences; movement never carries
meaning by itself. Keep contrast sufficient and pair each color state with text.

No analytics SDK, third-party tracker, fingerprint, persistent visitor ID, or
unnecessary external request belongs on the landing. The first-party measurement
endpoint records allowlisted aggregate event counts only; its limits are in the
[status register](SIGNAL_PRESS_STATUS.md).

## Responsive and runtime checks

Check Turkish and English at 320px, tablet and desktop; long titles; missing demo
data; no-JavaScript reading; keyboard path; reduced motion; and image/network
failure. A local build or DOM check does not establish browser geometry, Lighthouse
scores or production behavior. Record each proof separately.
