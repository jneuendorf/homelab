/**
 * Prefix root-absolute internal links in Markdown/MDX with the site `base`.
 *
 * Lets doc authors write `[x](/en/foo)` while the site still works when deployed under a
 * sub-path (e.g. GitHub Pages project site at `/homelab/`). Links that already start with the
 * base, protocol-relative (`//`) and external (`http…`, `mailto:`) links are left untouched.
 * Component-rendered links (CodeSnippet, nav) use `withBase()` and aren't Markdown, so the
 * plugin never sees them — no double-prefixing.
 */
export default function rehypeBaseLinks(options = {}) {
  const base = String(options.base || '/').replace(/\/$/, '');
  const rewrite = (v) =>
    typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith(base + '/')
      ? base + v
      : v;
  const walk = (node) => {
    if (node.type === 'element' && node.properties) {
      if ('href' in node.properties) node.properties.href = rewrite(node.properties.href);
      if ('src' in node.properties) node.properties.src = rewrite(node.properties.src);
    }
    node.children?.forEach(walk);
  };
  return (tree) => {
    if (base) walk(tree);
  };
}
