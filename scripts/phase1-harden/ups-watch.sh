#!/usr/bin/env bash
# Live UPS watch for the mains-pull test. Run as root on the HOST. Ctrl-C to stop.
set -uo pipefail                 # not -e: survive transient apcaccess hiccups on transfer
EVENTS=/var/log/apcupsd.events
red(){ printf '\033[1;31m%s\033[0m' "$*"; }; grn(){ printf '\033[1;32m%s\033[0m' "$*"; }
command -v apcaccess >/dev/null 2>&1 || { echo "apcupsd not installed — run apcupsd-setup.sh first"; exit 1; }
systemctl is-active --quiet apcupsd || { echo "apcupsd not running — 'systemctl start apcupsd'"; exit 1; }

# discrete events with timestamps, in the background
[ -f "$EVENTS" ] && { tail -Fn0 "$EVENTS" & trap 'kill "$!" 2>/dev/null' EXIT; }

echo "watching apcupsd — pull the mains when ready (Ctrl-C to stop)"
echo "tip: for a clean log (no logrotate history replayed by tail -F), start with:  : > $EVENTS && $0"
while :; do
  st=$(apcaccess -p STATUS 2>/dev/null || echo '?')
  case "$st" in
    *ONBATT*) tag=$(red "$st");;
    *ONLINE*) tag=$(grn "$st");;
    *)        tag="$st";;
  esac
  printf '%s  %-18s  line=%sV  batt=%s%%  left=%smin  load=%s%%\n' \
    "$(date +%H:%M:%S)" "$tag" \
    "$(apcaccess -p LINEV 2>/dev/null)" "$(apcaccess -p BCHARGE 2>/dev/null)" \
    "$(apcaccess -p TIMELEFT 2>/dev/null)" "$(apcaccess -p LOADPCT 2>/dev/null)"
  sleep 2
done
