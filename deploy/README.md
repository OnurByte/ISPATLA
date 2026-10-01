# deploy/

Production deployment artifacts for a single-node Ispatla panel.

- `nginx.conf` — vhost template. Substitute `PANEL_HOST` and the certificate
  path before installing. It carries no credentials: the panel authenticates
  with its own signed session cookie.
- `../ecosystem.config.cjs` — pm2 definition. Reads the admin token and the
  AES-256-GCM vault key from root-only files, generating them on first start.

## Secrets on the box (never in git)

| File | Purpose | Mode |
| --- | --- | --- |
| `/root/.ispatla-admin-token` | Bearer token for non-browser clients (worker, curl) | 600 |
| `/root/.ispatla-secret-key` | `ISPATLA_SECRET_KEY`: encrypts the provider-key vault and signs session cookies | 600 |
| `state/ispatla.sqlite3` | password digests and session records — created by migration 19 | 600 |

The admin token is no longer injected by the reverse proxy. It exists for
scripts and for the first-run bootstrap that creates the initial account;
interactive users sign in through the app's login screen instead.

## First-run account

The login route creates the initial account on its first successful login when
the `users` table is empty — that user becomes the admin. There is no default
password anywhere in the code or in this repository; pick one at that point.

## Lifecycle

```sh
# first deploy
cd /root/ispatla
bun install --frozen-lockfile
env -i HOME=/root PATH=/root/.bun/bin:/usr/bin:/bin bun run build   # clean env:
                                                                 # pm2's
                                                                 # NODE_* vars
                                                                 # abort next build
pm2 start ecosystem.config.cjs --only ispatla && pm2 save

# updates
git pull --ff-only
rm -rf .next                       # a half-written build leaves stale middleware
env -i HOME=/root PATH=/root/.bun/bin:/usr/bin:/bin bun run build
pm2 restart ispatla --update-env
```

`pm2 restart` on this box occasionally fails to reload ESM/Next code. If the live
bundle does not change, use `pm2 delete ispatla && pm2 start ecosystem.config.cjs --only ispatla`.
Never `pm2 kill` — the daemon is shared by every app on this machine.

## X bridge

Publishing targets X through the `x-use` CLI, which is a Python package in its
own virtualenv. `XUSE_BIN` points at it for both processes. Account sessions live
in `config/<account>_cookies.json` (gitignored); without them the bridge reports
the account as unhealthy and publishing is skipped.

## State

| Path | Contents |
| --- | --- |
| `state/ispatla.sqlite3` | all operational state (gitignored) |
| `config/sources.json` | source pool definition |
| `config/accounts.json` | x-use account list (gitignored) |

The long-running automation worker must own the scheduler, so the panel starts
with `ISPATLA_AUTOMATION=0`; otherwise the app's in-process scheduler and the
worker both open the same SQLite file (`automation_lock`). A worker that dies
while holding the lock leaves the row behind, and the next start refuses to run —
delete the `automation_lock` row from `app_settings` when its pid is gone.
