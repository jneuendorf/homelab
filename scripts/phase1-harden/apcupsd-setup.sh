#!/usr/bin/env bash
# apcupsd install + config for a USB UPS (e.g. APC Back-UPS BX500MI). Run as root on the HOST. Idempotent.
set -euo pipefail
CONF=/etc/apcupsd/apcupsd.conf
DEF=/etc/default/apcupsd
log(){ printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "must run as root on the Proxmox host"; exit 1; }

command -v apcaccess >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y apcupsd >/dev/null; log "installed apcupsd"; }

# Debian's apcupsd.conf ships every one of these keys present & uncommented, so plain per-line
# sed is enough — no append-if-missing fallback needed (the stock conf always has them).
sed -i -E 's|^[[:space:]]*#?[[:space:]]*UPSCABLE .*|UPSCABLE usb|'        "$CONF"  # cable = USB
sed -i -E 's|^[[:space:]]*#?[[:space:]]*UPSTYPE .*|UPSTYPE usb|'          "$CONF"  # driver = USB HID
sed -i -E 's|^[[:space:]]*#?[[:space:]]*DEVICE .*|DEVICE|'                "$CONF"  # blank → USB autodetect (stock ships /dev/ttyS0 — wrong for USB)
sed -i -E 's|^[[:space:]]*#?[[:space:]]*BATTERYLEVEL .*|BATTERYLEVEL 20|' "$CONF"  # backstop %; SLA estimate drifts near empty
sed -i -E 's|^[[:space:]]*#?[[:space:]]*MINUTES .*|MINUTES 10|'           "$CONF"  # primary trigger; >= 2-3x clean-shutdown time
sed -i -E 's|^[[:space:]]*#?[[:space:]]*ANNOY .*|ANNOY 0|'                "$CONF"  # headless host → drop wall nags
# TIMEOUT stays 0 (no blind timer); set it temporarily only to rehearse the park.
log "wrote UPSCABLE/UPSTYPE/DEVICE + thresholds in $CONF"

sed -i 's/^ISCONFIGURED=.*/ISCONFIGURED=yes/' "$DEF"   # the "ENABLE" switch
log "enabled in $DEF"

systemctl enable --now apcupsd >/dev/null 2>&1
systemctl restart apcupsd
sleep 1
log "apcaccess status:"; apcaccess status | grep -E '^(STATUS|MODEL|LINEV|BCHARGE|TIMELEFT|LOADPCT)' || true
log "done — expect STATUS: ONLINE. Now run ups-watch.sh and do the mains-pull test."
