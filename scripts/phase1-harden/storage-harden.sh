#!/usr/bin/env bash
# Proxmox single-node ZFS storage hardening — idempotent. Run as root on the HOST.
# Applies every consumer-SSD wear mitigation and doubles as a verifier (safe to re-run).
# usage: storage-harden.sh [pool]   (default pool: rpool)
set -euo pipefail
POOL="${1:-rpool}"
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "must run as root on the Proxmox host"; exit 1; }
zpool list "$POOL" >/dev/null 2>&1 || { echo "ZFS pool '$POOL' not found"; exit 1; }

# 1. compression — accept existing lz4/on (Proxmox default 'on' == lz4), else set lz4
cur=$(zfs get -H -o value compression "$POOL")
case "$cur" in
  lz4|on) log "compression already active ($cur)";;
  *)      zfs set compression=lz4 "$POOL"; log "compression: $cur -> lz4";;
esac

# 2. atime off — kill read-triggered metadata writes (write amplification on CoW)
if [ "$(zfs get -H -o value atime "$POOL")" = off ]; then log "atime already off"
else zfs set atime=off "$POOL"; log "atime -> off"; fi

# 3. pool autotrim + weekly fstrim timer
if [ "$(zpool get -H -o value autotrim "$POOL")" = on ]; then log "autotrim already on"
else zpool set autotrim=on "$POOL"; log "autotrim -> on"; fi
systemctl enable --now fstrim.timer >/dev/null 2>&1; log "fstrim.timer enabled (weekly)"

# 4. disable single-node HA daemons (no cluster => pointless pmxcfs writes)
for svc in pve-ha-lrm pve-ha-crm corosync; do
  if systemctl is-active --quiet "$svc" || systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    systemctl disable --now "$svc" >/dev/null 2>&1 || true; log "disabled $svc"
  else log "$svc already inactive+disabled"; fi
done

# 5. weekly ZFS scrub via systemd timer; retire the packaged monthly cron scrub
if systemctl list-unit-files 'zfs-scrub-weekly@.timer' | grep -q zfs-scrub-weekly; then
  systemctl disable --now "zfs-scrub-monthly@${POOL}.timer" >/dev/null 2>&1 || true
  systemctl enable  --now "zfs-scrub-weekly@${POOL}.timer"  >/dev/null 2>&1
  log "zfs-scrub-weekly@${POOL}.timer enabled"
else warn "zfs-scrub-weekly@.timer not present — skipped"; fi
CRON=/etc/cron.d/zfsutils-linux
if [ -f "$CRON" ]; then                       # comment scrub line only if not already commented
  sed -i '/zfs-linux\/scrub/{/^[[:space:]]*#/!s/^/#/}' "$CRON"
  log "packaged monthly cron scrub commented (TRIM line left intact)"
fi

# 6. smartmontools + report each NVMe's wear (identify by MODEL, not device number)
if ! command -v smartctl >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y smartmontools >/dev/null; log "installed smartmontools"
fi
for d in /dev/nvme[0-9]; do
  [ -e "$d" ] || continue
  model=$(smartctl -i "$d" 2>/dev/null | awk -F': *' '/Model Number/{print $2}' || true)
  used=$(smartctl -a "$d" 2>/dev/null | awk -F': *' '/Percentage Used/{print $2}' || true)
  log "$d = ${model:-?}  Percentage Used: ${used:-?}"
done
log "done — re-run anytime to re-verify"
