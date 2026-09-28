import type { Locale } from '../consts';

/** UI chrome strings, per locale. Doc *content* lives in src/content/docs/<locale>/. */
export const ui = {
  en: {
    'site.tagline': 'Building a Proxmox homelab — from hardware to a verified backup.',
    'nav.guide': 'Guide',
    'nav.projects': 'Projects',
    'nav.home': 'Home',
    'lang.label': 'Language',
    'lang.en': 'English',
    'lang.de': 'Deutsch',
    'doc.onThisPage': 'On this page',
    'doc.fallback':
      'This page has not been translated yet — showing the English version.',
    'snippet.fullFile': 'Full file',
    'snippet.github': 'GitHub',
    'snippet.lines': 'lines',
    'source.title': 'Source file',
    'source.download': 'Download raw',
    'source.viewOnGithub': 'View on GitHub',
    'source.back': 'Back to guide',
    'source.runnable': 'Part of a phase that can be run end-to-end — see the guide.',
  },
  de: {
    'site.tagline': 'Ein Proxmox-Homelab aufbauen — von der Hardware bis zum geprüften Backup.',
    'nav.guide': 'Anleitung',
    'nav.projects': 'Projekte',
    'nav.home': 'Start',
    'lang.label': 'Sprache',
    'lang.en': 'English',
    'lang.de': 'Deutsch',
    'doc.onThisPage': 'Auf dieser Seite',
    'doc.fallback':
      'Diese Seite ist noch nicht übersetzt — es wird die englische Version angezeigt.',
    'snippet.fullFile': 'Ganze Datei',
    'snippet.github': 'GitHub',
    'snippet.lines': 'Zeilen',
    'source.title': 'Quelldatei',
    'source.download': 'Rohdatei herunterladen',
    'source.viewOnGithub': 'Auf GitHub ansehen',
    'source.back': 'Zurück zur Anleitung',
    'source.runnable': 'Teil einer Phase, die komplett ausgeführt werden kann — siehe Anleitung.',
  },
} as const;

export type UIKey = keyof (typeof ui)['en'];

export const t = (locale: Locale) => (key: UIKey) => ui[locale][key] ?? ui.en[key];
