# homelab

An Astro site documenting a Proxmox homelab build (tutorial + runnable code), plus the executable
scripts themselves. Content is distilled and **sanitized** — no real IPs, credentials, or personal data.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site → dist/
npm run preview    # serve the build
```

Requires Node ≥ 22. Built with **Astro 7.3** + `@astrojs/mdx`.

## How it's put together

| Path | What |
|---|---|
| `src/content/docs/<locale>/*.mdx` | The tutorial content — one folder per language (`en`, `de`) |
| `src/components/CodeSnippet.astro` | Embeds a snippet from a real source file (optional line range) + links to the full file |
| `src/pages/[lang]/[...slug].astro` | Renders a doc for a locale, falling back to English when a translation is missing |
| `src/pages/source/[...path].astro` | Full-file viewer for everything under `scripts/` and `config/` |
| `scripts/phaseN-*/` | The executable, idempotent host scripts, grouped by roadmap phase |
| `scripts/run-phase.sh` | Run a whole phase end-to-end on the host |
| `scripts/deploy.sh` | Copy scripts + config to the Proxmox host |
| `config/` | Config templates (sanoid, fstab, Backrest notification hook) |

### Embedding code in the docs

```mdx
import CodeSnippet from '../../../components/CodeSnippet.astro';

<!-- a line range -->
<CodeSnippet file="scripts/phase1-harden/storage-harden.sh" start={20} end={27} />
<!-- the whole file -->
<CodeSnippet file="config/sanoid.conf" />
```

The snippet is read from disk at build time, so the code shown is always the code that runs. Each
embed links to the full file (rendered on-site at `/source/...` and on GitHub at the exact lines).

### Internationalization

`en` is the default locale; `de` is fully wired. A doc is translated by adding the same-named file
under `src/content/docs/de/`. Missing translations fall back to the English content and show a
notice banner, so the site is always complete. Currently translated to German: the landing page, the
glossary, and the UPS guide; the rest fall back to English.

### Running the scripts (phase by phase)

```bash
./scripts/deploy.sh root@YOUR_HOST      # copy scripts + config to the host
# then, on the host:
/opt/homelab/scripts/run-phase.sh 1     # Phase 1 — Harden (ZFS + UPS)
/opt/homelab/scripts/run-phase.sh 2     # Phase 2 — Data Safety (ZFS snapshots)
/opt/homelab/scripts/run-phase.sh all   # every phase, in order
```

Every script is idempotent and re-runnable (it doubles as a verifier).

## Deploying to GitHub Pages

The build is static (`dist/`). For a **project** site (`jneuendorf.github.io/homelab`) set
`base: '/homelab'` in `astro.config.mjs` — note the in-prose doc links currently use root-absolute
paths (`/en/...`), so a non-root base needs those made base-aware first. For a **user/org** site or a
custom domain, no `base` is needed and it works as-is.
