#!/usr/bin/env bash
# ISPATLA yerel geliştirme: Jev anahtarı env dosyasından, x-use PATH'ten. Anahtar hiçbir dosyaya yazılmaz.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . "/home/forn/Documents/ChatGPT/orvant - jev/.env"; set +a
export JEV_API_KEY="$TYPESAFE_API_KEY"
set -a; . /home/forn/.config/forn/secrets/jev-vercel.env; set +a
export AI_COMPATIBLE_API_KEY="$AI_GATEWAY_API_KEY"
export XUSE_BIN="${XUSE_BIN:-$HOME/.local/bin/x-use}"
export ISPUBLISHER_HANDLE="${ISPUBLISHER_HANDLE:-}"
exec bun dev "$@"
