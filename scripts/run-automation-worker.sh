#!/bin/sh
# pm2 entrypoint for the standalone automation worker.
#
#   1. pm2's `interpreter: "bun"` loads the script through Node's require() shim,
#      which rejects an async ESM module ("require() async module … is
#      unsupported"). Exec-ing the file directly keeps the ESM entrypoint the
#      worker expects.
#
#   2. `bun run <script>` does not forward --preload to the script it spawns, so
#      the SQLite shim (scripts/bun-sqlite-shim.mjs) never reached db.ts and the
#      worker died with "builtin is not a function". Invoking `bun` on the file
#      itself keeps the preload flag attached.
#
# See scripts/bun-sqlite-shim.mjs for why the shim exists at all.
set -e

cd /root/ispatla

# The x-use CLI lives in its own virtualenv (it is a Python package), so it is not
# on the default PATH. XUSE_BIN points at it, but the venv's bin directory also
# has to be exported for the helpers x-use shells out to.
PATH="/root/.xuse-venv/bin:$PATH"
export PATH

exec bun --preload ./scripts/bun-sqlite-shim.mjs scripts/automation-worker.ts
