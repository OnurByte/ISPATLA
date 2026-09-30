# deploy/

Production deployment artifacts for `ispatla.fermag.com.tr`.

- `nginx.conf` — vhost template (also installed at
  `/etc/nginx/sites-available/ispatla.fermag.com.tr`). Fill
  `ISPATLA_ADMIN_TOKEN` before installing.
- `../ecosystem.config.cjs` — pm2 definition. Reads the admin token and the
  AES-256-GCM vault key from root-only files, generating them on first start.

## Secrets on the box (never in git)

| File | Purpose | Mode |
| --- | --- | --- |
| `/root/.ispatla-admin-token` | Bearer token nginx injects for the app's own gate | 600 |
| `/root/.ispatla-secret-key` | `ISPATLA_SECRET_KEY`, encrypts the provider-key vault | 600 |
| `/etc/nginx/.htpasswd-ispatla` | basic-auth credential for the site | 640 root:www-data |

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
env -i HOME=/root PATH=/root/.bun/bin:/usr/bin:/bin bun run build
pm2 restart ispatla --update-env
```

`pm2 restart` on this box occasionally fails to reload ESM/Next code. If the live
bundle does not change, use `pm2 delete ispatla && pm2 start ecosystem.config.cjs --only ispatla`.
Never `pm2 kill` — the daemon is shared by every app on this machine.

## State

| Path | Contents |
| --- | --- |
| `state/ispatla.sqlite3` | all operational state (gitignored) |
| `config/sources.json` | source pool definition |

The long-running automation worker must own the scheduler, so the panel starts
with `ISPATLA_AUTOMATION=0`; otherwise the app's in-process scheduler and the
worker both open the same SQLite file (`automation_lock`).
