# Security

Do not publish credentials, private drafts or a usable exploit against a live
account in a public issue. Report a security concern privately to the repository
maintainer through GitHub's private vulnerability reporting when enabled. If
that channel is unavailable, ask the maintainer for a private reporting channel
without including the exploit details publicly.

Include the affected revision, the authorization boundary, a minimal redacted
local reproduction, and whether a remote action actually occurred. Report local
fixtures and live outcomes separately. The V3 branch is under implementation;
tests are not a production security certification.

Critical boundaries: real Better Auth sessions, owner-scoped SQLite queries,
separate X OAuth grants and automation consent, encrypted credentials, final
policy rechecks, once-only request markers, and authenticated reconciliation.
Never retry an unknown remote write automatically.
