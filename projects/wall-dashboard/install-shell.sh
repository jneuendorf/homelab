#!/usr/bin/env bash
# Push the wall-dashboard shell into the LXC, build it there, (re)start its systemd service.
# Runs next to MagicMirror (port 8090 vs 8080) until it reaches parity.
# Run as root on the Proxmox HOST (after deploy.sh has synced the repo there).
# usage: install-shell.sh [ctid]
set -euo pipefail
container_id="${1:-101}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
app_dir=/opt/wall-dashboard
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "must run as root on the Proxmox host"; exit 1; }
pct status "$container_id" | grep -q running || { echo "CT $container_id is not running"; exit 1; }

# Node ≥ 22.18: runs .ts directly (type stripping) and has node:sqlite built in.
pct exec "$container_id" -- node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 18)) { console.error(`node ${process.version} < 22.18`); process.exit(1); }'

# Code only: MagicMirror bits stay out, and host-local files (dashboard.local.ts, .env, data)
# are never in the tarball, so a deploy can't clobber them.
tarball="$(mktemp --suffix=.tar.gz)"
trap 'rm -f "$tarball"' EXIT
tar -C "$script_dir" -czf "$tarball" \
  --exclude=node_modules --exclude=dist --exclude=data --exclude=config --exclude=modules \
  --exclude=dashboard.local.ts --exclude=.env --exclude='*.test.ts' .
pct exec "$container_id" -- mkdir -p "$app_dir"
pct push "$container_id" "$tarball" /tmp/wall-dashboard.tar.gz
pct exec "$container_id" -- tar -C "$app_dir" --no-same-owner -xzf /tmp/wall-dashboard.tar.gz
pct exec "$container_id" -- rm /tmp/wall-dashboard.tar.gz
log "sources → CT $container_id:$app_dir"

# Built inside the CT so dashboard.local.ts never has to leave it.
pct exec "$container_id" -- sh -c "cd $app_dir && npm ci --no-audit --no-fund && npm run build"
log "built"

node_bin="$(pct exec "$container_id" -- sh -c 'command -v node')"
pct exec "$container_id" -- sh -c "id wall >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin wall"
# The calendar's "today" is the CT's local day — make sure its timezone is right (timedatectl).
pct exec "$container_id" -- sh -c "cat > /etc/systemd/system/wall-dashboard.service" <<EOF
[Unit]
Description=Wall Dashboard
After=network-online.target
Wants=network-online.target

[Service]
User=wall
WorkingDirectory=$app_dir
# secrets (CAL_KIND1=https://…) — root-readable only, systemd reads it before dropping privileges
EnvironmentFile=-$app_dir/.env
Environment=PORT=8090 WALL_DATA=/var/lib/wall-dashboard/wall.db NODE_ENV=production
StateDirectory=wall-dashboard
ExecStart=$node_bin server/main.ts
Restart=on-failure
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
pct exec "$container_id" -- systemctl daemon-reload
pct exec "$container_id" -- systemctl enable --now wall-dashboard
pct exec "$container_id" -- systemctl restart wall-dashboard
log "wall-dashboard running in CT $container_id on :8090"
