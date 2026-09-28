#!/usr/bin/env bash
# create-lxc.sh — create an unprivileged Debian LXC if it doesn't exist. Run as root on the HOST. Idempotent.
# usage: create-lxc.sh <CTID> <hostname> [cores] [mem_mb] [disk_gb]
set -euo pipefail
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "must run as root on the Proxmox host"; exit 1; }

CTID="${1:?usage: create-lxc.sh <CTID> <hostname> [cores] [mem_mb] [disk_gb]}"
HOST="${2:?usage: create-lxc.sh <CTID> <hostname> [cores] [mem_mb] [disk_gb]}"
CORES="${3:-1}"; MEM="${4:-512}"; DISK="${5:-8}"
TEMPLATE_NAME="debian-12-standard"   # bump when a newer standard template lands (pveam available --section system)
STORAGE_TMPL="local"                 # where templates are stored
STORAGE_ROOT="local-zfs"             # CT rootfs storage (Proxmox default guest storage)

if pct status "$CTID" &>/dev/null; then
  log "CT $CTID already exists — nothing to create"
  exit 0
fi

log "refreshing template catalog"
pveam update >/dev/null
TMPL="$(pveam available --section system | awk -v n="$TEMPLATE_NAME" '$2 ~ n {print $2}' | sort -V | tail -1)"
[ -n "$TMPL" ] || { warn "no '$TEMPLATE_NAME' template in the catalog"; exit 1; }
if ! pveam list "$STORAGE_TMPL" | grep -q "$TMPL"; then
  log "downloading template $TMPL"
  pveam download "$STORAGE_TMPL" "$TMPL" >/dev/null
fi

log "creating unprivileged CT $CTID ($HOST): ${CORES}c / ${MEM}MB / ${DISK}G"
pct create "$CTID" "${STORAGE_TMPL}:vztmpl/${TMPL}" \
  --hostname "$HOST" \
  --cores "$CORES" --memory "$MEM" --swap "$MEM" \
  --rootfs "${STORAGE_ROOT}:${DISK}" \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --onboot 1

log "created CT $CTID. next: pct start $CTID · pct enter $CTID · then bind-mounts + app install"
