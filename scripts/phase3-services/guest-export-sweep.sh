#!/usr/bin/env bash
# guest-export-sweep.sh — pull each guest's irreplaceable state via a standard in-guest
# command and drop it in the guest-exports dir for restic/Backrest to sweep up.
# Run as root on the HOST (from cron). Re-runnable; guests without the command are skipped,
# so this is a safe no-op until a guest actually ships an exporter.
# usage: guest-export-sweep.sh [export_dir] [keep_per_guest]
set -euo pipefail
EXPORT_DIR="${1:-/rpool/bulk/guest-exports}"   # lands in bulk data → swept by Backrest
KEEP="${2:-7}"                                  # dated copies kept per guest (older pruned)
CMD=/usr/local/sbin/guest-export               # THE CONTRACT: every exportable guest ships this; it prints ONE tar stream to stdout (names live inside the tar), logs to stderr, exits 0 on success
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=5) # VM transport; host pubkey must already be trusted in the VM (provisioning, not runtime config)
log(){  printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "must run as root on the Proxmox host"; exit 1; }
mkdir -p "$EXPORT_DIR"
stamp="$(date +%F)"; rc=0

# one guest: probe for $CMD, else skip; if present, capture its stdout (binary-clean) → dated .zst, prune old.
# $1 = guest name (the output basename); $2.. = the transport prefix that runs a command IN that guest.
sweep(){
  local name="$1"; shift
  local -a run=( "$@" )
  "${run[@]}" test -x "$CMD" >/dev/null 2>&1 || { log "skip $name (no $CMD)"; return 0; }
  local out="$EXPORT_DIR/${name}-${stamp}.tar.zst"   # always tar-inside → honest extension, one restore recipe
  if "${run[@]}" "$CMD" 2>/dev/null | zstd -q -o "$out.tmp" - && [ -s "$out.tmp" ]; then
    mv -f "$out.tmp" "$out"
    log "exported $name → $(basename "$out") ($(du -h "$out" | cut -f1))"
    ls -1t "$EXPORT_DIR/${name}-"*.tar.zst 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
  else
    rm -f "$out.tmp"; warn "FAILED export: $name"; rc=1
  fi
}

# Transport is a function of guest TYPE, never per-guest config:
#   LXC → pct exec  (hypervisor pipe: binary-clean, no network/keys/agent)
#   VM  → ssh       (binary-clean pipe; `qm guest exec` JSON-wraps stdout with base64 + a size cap → unfit for dumps)
# Only running guests can exec; stopped ones are silently out of scope this run.
while read -r id name; do
  sweep "$name" pct exec "$id" --
done < <(pct list | awk 'NR>1 && $2=="running"{print $1, $NF}')

while read -r id name; do
  sweep "$name" ssh "${SSH_OPTS[@]}" "$name"   # ssh alias = guest name; add a root ~/.ssh/config Host block per exportable VM
done < <(qm list | awk 'NR>1 && $3=="running"{print $1, $2}')

if [ "$rc" -eq 0 ]; then log "sweep OK"; else warn "sweep finished with failures"; fi
exit "$rc"   # non-zero → let cron MAILTO / systemd OnFailure raise the alert
