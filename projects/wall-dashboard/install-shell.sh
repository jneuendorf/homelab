#!/usr/bin/env bash
# One command, like a community script: create the LXC if it's missing, install Node, push the
# wall-dashboard into it, build it there, (re)start its systemd service (:8080). Re-run to update.
# Run as root on the Proxmox HOST (after deploy.sh has synced the repo there).
# usage: install-shell.sh [ctid]
set -euo pipefail
container_id="${1:-101}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
app_dir=/opt/wall-dashboard
new_dir="$app_dir.new"
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
die(){ printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "must run as root on the Proxmox host"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# unprivileged Debian, 1 core / 512 MB / 4 G — the app idles at ~100 MB RSS
if pct status "$container_id" &>/dev/null; then
  # a mistyped ID must not install into another service's CT
  hostname="$(pct config "$container_id" | awk '/^hostname:/ {print $2}')"
  [ "$hostname" = wall-dashboard ] || die "CT $container_id is '$hostname', not wall-dashboard"
else
  "$script_dir/../../scripts/phase3-services/create-lxc.sh" "$container_id" wall-dashboard 1 512 4
fi
pct status "$container_id" | grep -q running || pct start "$container_id"
dns_ok(){ pct exec "$container_id" -- getent hosts deb.debian.org >/dev/null; }
for _ in $(seq 30); do dns_ok && break; sleep 1; done
dns_ok || die "CT $container_id can't resolve deb.debian.org — check its network/DNS"

# Node ≥ 22.18: runs .ts directly (type stripping) and has node:sqlite built in. Debian's own is
# older, so Node 24 LTS comes from NodeSource's apt repo — apt upgrade keeps it patched. Its
# signing key is pinned to the fingerprint NodeSource publishes.
nodesource_key=6F71F525282841EEDAF851B42F59B5F99B1BE0B4 # public fingerprint, gitleaks:allow
node_ok(){
  pct exec "$container_id" -- sh -c 'command -v node >/dev/null && node -e "
    const [major, minor] = process.versions.node.split(\".\").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 18) ? 0 : 1)"'
}
if ! node_ok; then
  log "installing Node 24 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$work/nodesource.asc"
  gpg --homedir "$work" --show-keys --with-colons "$work/nodesource.asc" 2>/dev/null |
    grep -q "^fpr:*$nodesource_key:" || die "NodeSource key doesn't match $nodesource_key"
  pct exec "$container_id" -- install -d /etc/apt/keyrings
  pct push "$container_id" "$work/nodesource.asc" /etc/apt/keyrings/nodesource.asc
  pct exec "$container_id" -- sh -c '
    set -e
    export DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8
    apt-get update -qq && apt-get install -y -qq ca-certificates >/dev/null
    printf "Types: deb\nURIs: https://deb.nodesource.com/node_24.x\nSuites: nodistro\nComponents: main\nSigned-By: /etc/apt/keyrings/nodesource.asc\n" \
      > /etc/apt/sources.list.d/nodesource.sources
    apt-get update -qq && apt-get install -y -qq nodejs >/dev/null'
  node_ok || die "node in CT $container_id is still < 22.18"
fi

# Code only: host-local files (dashboard.local.ts, .env, data) are never in the tarball, so a
# deploy can't clobber them. ./ anchors to the top level, so an app's own data/ or dist/ ships.
tar -C "$script_dir" -czf "$work/app.tar.gz" \
  --exclude=node_modules --exclude=./dist --exclude=./data \
  --exclude=dashboard.local.ts --exclude=.env --exclude='*.test.ts' .
pct push "$container_id" "$work/app.tar.gz" /tmp/wall-dashboard.tar.gz
# Built inside the CT so dashboard.local.ts never has to leave it — in a fresh copy next to the
# live one, so a failed build leaves the running version untouched.
pct exec "$container_id" -- sh -c "
  set -e
  rm -rf $new_dir && mkdir -p $new_dir
  tar -C $new_dir --no-same-owner -xzf /tmp/wall-dashboard.tar.gz && rm /tmp/wall-dashboard.tar.gz
  for f in dashboard.local.ts .env; do [ ! -e $app_dir/\$f ] || cp -p $app_dir/\$f $new_dir/; done
  [ ! -e $new_dir/.env ] || chmod 600 $new_dir/.env
  cd $new_dir && npm ci --no-audit --no-fund && npm run build"
log "built → CT $container_id:$new_dir"

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
Environment=PORT=8080 WALL_DATA=/var/lib/wall-dashboard/wall.db NODE_ENV=production
StateDirectory=wall-dashboard
ExecStart=$node_bin server/main.ts
Restart=on-failure
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
# swap in the new build, then restart onto it
pct exec "$container_id" -- sh -c "
  set -e
  rm -rf $app_dir.old
  [ ! -d $app_dir ] || mv $app_dir $app_dir.old
  mv $new_dir $app_dir"
pct exec "$container_id" -- systemctl daemon-reload
pct exec "$container_id" -- systemctl enable --quiet wall-dashboard
pct exec "$container_id" -- systemctl restart wall-dashboard
pct exec "$container_id" -- rm -rf "$app_dir.old"
log "wall-dashboard running in CT $container_id on :8080"
pct exec "$container_id" -- test -f "$app_dir/dashboard.local.ts" ||
  log "using the sample config — put yours in CT $container_id:$app_dir/dashboard.local.ts + .env, re-run"
