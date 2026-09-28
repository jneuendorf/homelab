// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import rehypeBaseLinks from './src/lib/rehype-base-links.mjs';

// GitHub Pages project site: https://jneuendorf.github.io/homelab/
const SITE = 'https://jneuendorf.github.io';
const BASE = '/homelab';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [mdx()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    routing: {
      // We route i18n manually via the [lang] segment + a fallback in getStaticPaths,
      // so Astro's helpers (getRelativeLocaleUrl, …) are available but don't own routing.
      prefixDefaultLocale: true,
    },
  },
  markdown: {
    // Make root-absolute in-prose links (/en/…) base-aware so they survive the /homelab sub-path.
    rehypePlugins: [[rehypeBaseLinks, { base: BASE }]],
    shikiConfig: {
      // dual themes → the CSS in BaseLayout switches them by prefers-color-scheme
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
