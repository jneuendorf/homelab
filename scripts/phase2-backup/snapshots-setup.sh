#!/usr/bin/env bash
# Install sanoid + enable scheduled ZFS snapshots of the bulk dataset. Idempotent. Run as root on the HOST.
# The sanoid policy lives in config/sanoid.conf (single source of truth) and is installed to /etc/sanoid.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # repo root (scripts/phase2-backup/ → ../../)
CONF_SRC="$ROOT/config/sanoid.conf"
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "must run as root on the Proxmox host"; exit 1; }
[ -f "$CONF_SRC" ] || { echo "missing $CONF_SRC"; exit 1; }

command -v sanoid >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y sanoid >/dev/null; log "installed sanoid"; }

mkdir -p /etc/sanoid
if ! cmp -s "$CONF_SRC" /etc/sanoid/sanoid.conf 2>/dev/null; then
  install -m0644 "$CONF_SRC" /etc/sanoid/sanoid.conf
  log "installed /etc/sanoid/sanoid.conf"
else
  log "/etc/sanoid/sanoid.conf already current"
fi

# The Debian package auto-enables sanoid.timer (every 15 min) — just confirm + seed the first snapshots.
systemctl list-timers 'sanoid*' --no-pager | grep -q sanoid && log "sanoid.timer scheduled" || log "note: enable sanoid.timer if your packaging didn't"
sanoid --cron --verbose || true   # take what's due + prune now (safe to run anytime)
log "done — verify with: zfs list -rt snapshot rpool/bulk"
