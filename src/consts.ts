/** Site-wide configuration. */

export const SITE_TITLE = 'Homelab';

export const LOCALES = ['en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** GitHub repo the scripts live in — used for "view whole file on GitHub" links. */
export const REPO = {
  owner: 'jneuendorf',
  name: 'homelab',
  branch: 'main',
};
export const repoBlobUrl = (path: string, start?: number, end?: number) => {
  const anchor = start ? `#L${start}${end && end !== start ? `-L${end}` : ''}` : '';
  return `https://github.com/${REPO.owner}/${REPO.name}/blob/${REPO.branch}/${path}${anchor}`;
};

/** Prefix a root-relative path with the configured base (safe if `base` is set later). */
export const withBase = (p: string) =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;
