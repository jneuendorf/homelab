dev:
    npm run dev

alias start := dev

build:
    npm run build

# astro check does typechecking too; format/lint aren't set up in this project
format:
    npx prettier --write .

check:
    npx astro check

# scan whole history for secrets/PII (same rules the pre-commit hook and CI use)
scan:
    gitleaks git --redact --verbose

# run the CI pipeline locally (scan + build, no deploy)
ci: scan build
