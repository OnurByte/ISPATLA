# İSPATLA design register

The public surface explains the product; `/app` shows operational evidence.
Provider status, empty/live work and receipts never become marketing statistics.
The Signal Press landing and shared paper/carbon/cobalt theme are implemented; [LANDING_DESIGN_SYSTEM.md](LANDING_DESIGN_SYSTEM.md) records
the approved target direction and [SIGNAL_PRESS_STATUS.md](SIGNAL_PRESS_STATUS.md)
tracks proof by phase.

## Current tokens and geometry

Use the existing neutral background/foreground/muted/border tokens in globals.css.
Public accents are cobalt: blue-600 for actions, blue-700 for light-background
emphasis, blue-300 for dark-background emphasis. The creator card uses blue-950
with white/blue-100 text. Color supplements a status label rather than replacing it.

Libron is the only site font for interface text, editorial headings, the brand wordmark, dense record IDs and code; the original brand symbol remains unchanged. Public content width is 72–80rem;
text paragraphs are bounded at 46rem. Horizontal page padding is 20px, rising to
32px. Action targets are at least 44px tall. Navigation wraps at narrow widths.

## Motion

Only the public creator card follows the mouse. The same normalized pointer
coordinates determine ±6 degree rotation and specular light position. Text gets
32px depth. Touch/coarse pointers and reduced-motion preferences disable tilt,
remove depth, and use a static centered spotlight. Keyboard use needs no motion.
No dashboard metric, queue item or private operational card uses this effect.

Press changes are brief; hover follows at 120ms. Reduced motion removes travel.
Avoid animated status claims; unknown/partial states must remain readable.

## Content and states

Every score states its meaning: decision score, calibrated probability only when
validated, or observed result. Missing metrics remain missing. Fixture data and
simulated receipts are labelled. Unknown remote write state links to evidence and
repair; it never suggests an automatic resend.

Public pages: landing, docs, security, privacy and technical usage boundaries.
License is AGPL-3.0-or-later in LICENSE; third-party licenses remain separate.
The privacy/usage pages describe current product behavior and explicitly defer
hosting, retention and service commitments to the actual deployment operator.

## Verification matrix

Verify empty, single, 10 and 100 item data; long handles/titles; missing/failed
metrics; unknown writes; mixed Turkish/English; 320px/desktop widths; keyboard and
reduced motion. Public page HTTP/DOM proof and browser geometry proof are separate.
The register is an implemented direction, not a claim that this full matrix has
already been audited.
