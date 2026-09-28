#!/usr/bin/env bash
# Deploy the homelab scripts + config to the Proxmox host, preserving the phase structure,
# then you run them there with run-phase.sh. Run from your workstation.
# usage: deploy.sh [user@host] [dest-dir]
set -euo pipefail
HOST="${1:-root@192.168.1.10}"     # example host IP — replace with yours
DEST="${2:-/opt/homelab}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }

log "syncing scripts/ + config/ + projects/ → $HOST:$DEST"
ssh "$HOST" "mkdir -p '$DEST'"
rsync -a --delete --exclude='*.test.js' "$ROOT/scripts" "$ROOT/config" "$ROOT/projects" "$HOST:$DEST/"
ssh "$HOST" "chmod +x '$DEST'/scripts/*.sh '$DEST'/scripts/*/*.sh '$DEST'/projects/*/install.sh 2>/dev/null || true"
log "done — on the host:  $DEST/scripts/run-phase.sh 1"
