import { getCollection, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, type Locale } from '../consts';

export type Doc = CollectionEntry<'docs'>;

/** id is "<locale>/<slug>" (slug may contain slashes). The glob loader collapses
 *  "<locale>/index" to just "<locale>", so an empty slug is normalized to "index". */
export const parseId = (id: string) => {
  const [locale, ...rest] = id.split('/');
  return { locale: locale as Locale, slug: rest.join('/') || 'index' };
};

/** slug -> (locale -> entry) */
export async function getDocsBySlug(): Promise<Map<string, Map<Locale, Doc>>> {
  const all = await getCollection('docs');
  const bySlug = new Map<string, Map<Locale, Doc>>();
  for (const entry of all) {
    const { locale, slug } = parseId(entry.id);
    if (!bySlug.has(slug)) bySlug.set(slug, new Map());
    bySlug.get(slug)!.set(locale, entry);
  }
  return bySlug;
}

/** Resolve one doc for a locale, falling back to the default locale's content. */
export function resolveDoc(
  bySlug: Map<string, Map<Locale, Doc>>,
  slug: string,
  locale: Locale,
): { entry: Doc; translated: boolean } | null {
  const variants = bySlug.get(slug);
  if (!variants) return null;
  const entry = variants.get(locale) ?? variants.get(DEFAULT_LOCALE);
  if (!entry) return null;
  return { entry, translated: variants.has(locale) };
}

export type NavItem = { slug: string; title: string; order: number };

/** Ordered nav for a locale, split into sidebar sections. */
export async function getNav(locale: Locale) {
  const bySlug = await getDocsBySlug();
  const guide: NavItem[] = [];
  const projects: NavItem[] = [];
  for (const slug of bySlug.keys()) {
    if (slug === 'index') continue;
    const r = resolveDoc(bySlug, slug, locale)!;
    const item = { slug, title: r.entry.data.title, order: r.entry.data.order };
    (slug.startsWith('projects/') ? projects : guide).push(item);
  }
  const byOrder = (a: NavItem, b: NavItem) => a.order - b.order;
  return { guide: guide.sort(byOrder), projects: projects.sort(byOrder) };
}
