dev:
    npm run dev

alias start := dev

# Each recipe below runs the npm script of that name in every projects/*/ that defines it, then
# at the root (Astro site). A project that is a monorepo itself fans out in its own script
# (e.g. "lint": "npm run lint --workspaces --if-present") — the root only knows one entry point.
build: (_each "build")

# prettier (+ prettier-plugin-astro) at the root formats everything incl. projects/ and .astro/.mdx
format: (_each "format")

check: (_each "check")

lint: (_each "lint")

[private]
_each script:
    #!/usr/bin/env bash
    set -euo pipefail
    for pkg in projects/*/package.json; do
      dir=$(dirname "$pkg")
      grep -q "\"{{ script }}\":" "$pkg" || continue
      echo "── $dir: {{ script }}"
      [ -d "$dir/node_modules" ] || npm --prefix "$dir" ci
      npm --prefix "$dir" run {{ script }}
    done
    echo "── root: {{ script }}"
    npm run --if-present {{ script }}

# scan whole history for secrets/PII (same rules the pre-commit hook and CI use)
scan:
    gitleaks git --redact --verbose

# run the CI pipeline locally (scan + build, no deploy)
ci: scan build
