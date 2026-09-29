#!/usr/bin/env bash
# Push Wall Dashboard config + custom modules into the MagicMirror LXC and restart.
# Run as root on the Proxmox HOST (after deploy.sh has synced the repo there).
# usage: install.sh [ctid]
set -euo pipefail
container_id="${1:-101}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
magicmirror_dir=/opt/magicmirror
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "must run as root on the Proxmox host"; exit 1; }
pct status "$container_id" | grep -q running || { echo "CT $container_id is not running"; exit 1; }

for config_file in "$script_dir"/config/*; do
  [ -f "$config_file" ] || continue
  pct push "$container_id" "$config_file" "$magicmirror_dir/config/$(basename "$config_file")"
  log "config/$(basename "$config_file") → CT $container_id"
done

for module_dir in "$script_dir"/modules/*/; do
  [ -d "$module_dir" ] || continue
  module_name="$(basename "$module_dir")"
  pct exec "$container_id" -- mkdir -p "$magicmirror_dir/modules/$module_name"
  for module_file in "$module_dir"*; do
    [ -f "$module_file" ] || continue
    [[ "$(basename "$module_file")" == *.test.* ]] && continue
    pct push "$container_id" "$module_file" "$magicmirror_dir/modules/$module_name/$(basename "$module_file")"
    log "modules/$module_name/$(basename "$module_file") → CT $container_id"
  done
done

pct exec "$container_id" -- systemctl restart magicmirror
log "restarted magicmirror in CT $container_id"
