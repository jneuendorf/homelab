#!/usr/bin/env bash
# run-phase.sh — run a roadmap phase's setup scripts, in order, as one idempotent pass.
# Mirrors the Obsidian "one-shot per topic" idea, but at phase granularity.
# Run as root ON THE HOST (after deploy.sh has copied the repo to it).
#
#   run-phase.sh 1      # Phase 1 — Harden (ZFS wear mitigations + UPS auto-shutdown)
#   run-phase.sh 2      # Phase 2 — Data Safety (scheduled ZFS snapshots)
#   run-phase.sh 3      # Phase 3 — Services (guest-export sweep)
#   run-phase.sh all    # every phase, in order
#
# Only idempotent, argument-free setup scripts run automatically. Interactive/parameterised
# helpers (e.g. create-lxc.sh) and live tools (ups-watch.sh) are intentionally NOT auto-run.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
bold(){ printf '\033[1m%s\033[0m\n' "$*"; }

# phase → ordered list of scripts (relative to this dir)
phase_scripts() {
  case "$1" in
    1) echo "phase1-harden/storage-harden.sh phase1-harden/apcupsd-setup.sh" ;;
    2) echo "phase2-backup/snapshots-setup.sh" ;;
    3) echo "phase3-services/guest-export-sweep.sh" ;;
    *) return 1 ;;
  esac
}

run_phase() {
  local n="$1" s
  bold "=== Phase $n ==="
  for s in $(phase_scripts "$n"); do
    bold "--- $s ---"
    bash "$HERE/$s"
  done
}

case "${1:-}" in
  1|2|3) run_phase "$1" ;;
  all)   for n in 1 2 3; do run_phase "$n"; done ;;
  *) echo "usage: run-phase.sh <1|2|3|all>"; exit 1 ;;
esac
bold "phase run complete"
