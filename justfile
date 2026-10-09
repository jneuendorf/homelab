dev:
    npm run dev

alias start := dev

build:
    npm run build

# prettier (+ prettier-plugin-astro) formats everything incl. .astro/.mdx
format:
    npm run format

check:
    npx astro check

# scan whole history for secrets/PII (same rules the pre-commit hook and CI use)
scan:
    gitleaks git --redact --verbose

# run the CI pipeline locally (scan + build, no deploy)
ci: scan build
