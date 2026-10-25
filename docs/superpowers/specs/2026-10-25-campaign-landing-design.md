# ispatla.tr campaign landing

The owner selected landing, design and marketing as the immediate priority on 2026-10-25. The brand is **ispatla.tr**. The product direction is topical campaigns across multiple customer-owned accounts, with AI and MCP prominent. Bulk review/approval should be a choice, not the defining mandatory step in the marketing story. This scope clarification supersedes an expansion into the unfinished publishing backend.

## Direction

Replace the personal writing-desk story with a campaign workspace: one brief, several accounts, AI-assisted drafts, and a clearer view of performance. Lead with customer value. Use the existing geometric mark, local Libron typography, editorial whitespace, cobalt accents and a dark product panel. The panel should contain a large growth chart and multiple account rows; interactive periods and individual/bulk review previews explain the proposed experience. Label the preview visibly as illustrative data; do not invent customer results, customers, testimonials or operational integrations.

The page contains a concise header, hero and product preview, three-step workflow, a visually distinct agentic/MCP section, customer FAQ, final signup CTA and compact legal/resource footer. Preserve Turkish plus all nineteen existing locales, including Arabic/Urdu RTL, localized routes and SEO. The page remains readable without JavaScript; native FAQ and links work independently of the product preview.

## Approaches and owner choice

1. Full campaign system and operational publishing: larger backend change; existing dispatch is intentionally blocked and lacks required write fencing and persistence.
2. Customer product/landing transformation first: reuse factual draft/MCP capabilities, redesign the marketing surface and remove retired landing experiments. **Selected by the owner**, who explicitly said to finish the landing and prioritize design/marketing.

## Boundaries and proof

Do not claim instant bulk publication, unattended automatic sending, live trend discovery, a hosted MCP endpoint, or measured growth that the current implementation cannot substantiate. Bulk vs individual review is a labeled product-preview selection, not a backend change. MCP is currently a local stdio server with an authenticated session; its actual opportunity and draft tools are the basis for the landing claim. Document this setup in a dedicated customer-help section.

Remove unused landing-only experiments after checking their import graph and updating tests that directly target retired components. Preserve security/evidence docs and the existing next-env.d.ts change. No live publishing or deployment is part of this scope.

Acceptance: complete localized server-rendered landing; working preview controls; visible illustrative-data label; working localized signup/docs/MCP links; no retired research/maths/cost-calculator narrative on the homepage; no false available-product claims; desktop/mobile/RTL checks; focused tests, lint, typecheck and production build.
