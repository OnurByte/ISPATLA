#!/usr/bin/env bash
# Installs and starts the user-level Ispatla worker.
# Reference: docs/RUN-WORKER.md (commands, env file template, checks).
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
env_dir="${XDG_CONFIG_HOME:-$HOME/.config}/ispatla"
bun_bin="${BUN_BIN:-$HOME/.bun/bin/bun}"

if [[ ! -x "$bun_bin" ]]; then
  echo "Bun bulunamadı: $bun_bin" >&2
  echo "BUN_BIN=/mutlak/yol/bun ile tekrar çalıştır." >&2
  exit 1
fi
command -v systemctl >/dev/null || { echo "systemctl bulunamadı" >&2; exit 1; }
command -v flock >/dev/null || { echo "flock bulunamadı (util-linux gerekli)" >&2; exit 1; }

mkdir -p "$unit_dir" "$env_dir"
# WorkingDirectory/ExecStart are placeholders in the repo unit: bind them to this checkout.
sed -e "s|__ISPATLA_REPO_DIR__|$repo_dir|g" -e "s|__ISPATLA_BUN_BIN__|$bun_bin|g" \
  "$repo_dir/systemd/ispatla-worker.service" > "$unit_dir/ispatla-worker.service"
chmod 0644 "$unit_dir/ispatla-worker.service"

env_file="$env_dir/worker.env"
if [[ ! -e "$env_file" ]]; then
  umask 077
  cat > "$env_file" <<TEMPLATE
# Ispatla user worker. Secret değerlerini yalnız burada tut (chmod 600).
# Değer yazılan satırın başındaki # işaretini kaldır.
# ISPATLA_SECRET_KEY=
# ISPATLA_WORKER_TICK_MS=15000
# AI_COMPATIBLE_API_KEY=
# OPENAI_API_KEY=
# JEV_API_KEY=
TEMPLATE
  chmod 600 "$env_file"
fi

# Single writer rule: a Next process on the same database must not run its own
# scheduler. The worker refuses to start while another holder owns automation_lock.
echo "UYARI: aynı veritabanında 'next dev/start' çalışıyorsa ISPATLA_AUTOMATION=0 ile başlat." >&2

systemctl --user daemon-reload
systemctl --user disable --now ispatla-scan.timer >/dev/null 2>&1 || true
systemctl --user enable --now ispatla-worker.service
systemctl --user --no-pager status ispatla-worker.service
echo
echo "Kuruldu. Ortam dosyası: $env_file"
echo "Log: journalctl --user -u ispatla-worker.service -n 50 --no-pager"
