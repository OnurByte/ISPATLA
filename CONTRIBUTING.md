# Contributing

İSPATLA is licensed under AGPL-3.0-or-later. See LICENSE. Existing third-party
packages retain their own licenses.

Use Node.js 22.5+ and Bun. Start with `bun install --frozen-lockfile`, then
`bun run demo`. Demo uses a disposable SQLite database, synthetic sources and
local login `demo@example.test` / `demo-password-123456`. It needs no X or AI
credentials. Stop it with Ctrl+C. The normal app uses the environment described
in README; never point demo seeds at a real database.

Before submitting a change run `bun test`, `bun run lint`, `bun run typecheck`,
and `bun run build`. Preserve nullable metrics, owner scopes and publication
receipt lineage. Test provider boundaries with injected fixture clients; a
fixture receipt is not a live publication. Do not include tokens, cookies,
databases, downloaded media or account-specific logs in contributions.

Read AGENTS.md and the installed Next.js guides before changing routes. Keep
source content and editable style instructions below immutable policy. Public
reader observations can be shared; private drafts, usage, grants and outcomes
must stay inside the authenticated owner context.

Suggested first contributions: add a labeled event lineage fixture; improve
keyboard access for queue filters; add a timezone boundary case; translate an
existing UI label without changing policy or provider authority.
