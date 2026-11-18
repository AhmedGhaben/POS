/**
 * Site languages. pt-AO is the default and lives at the root; English lives
 * under /en/ with English slugs. Every page exists in both languages and the
 * header switcher links to the equivalent page.
 *
 * Copy is written inline as pairs: t('pt-AO text', 'English text'), so both
 * versions sit side by side for reviewers and can't drift apart.
 */
export type Lang = 'pt-AO' | 'en';
export const LANGS: Lang[] = ['pt-AO', 'en'];
export const DEFAULT_LANG: Lang = 'pt-AO';

export type RouteKey =
  | 'home'
  | 'how'
  | 'about'
  | 'demo'
  | 'help'
  | 'pricing'
  | 'download'
  | 'terms'
  | 'privacy'
  | 'cookies'
  | 'notFound'
  | 'preview';

export const ROUTES: Record<RouteKey, Record<Lang, string>> = {
  home: { 'pt-AO': '/', en: '/en' },
  how: { 'pt-AO': '/como-funciona', en: '/en/how-it-works' },
  about: { 'pt-AO': '/sobre', en: '/en/about' },
  demo: { 'pt-AO': '/demonstracao', en: '/en/demo' },
  help: { 'pt-AO': '/ajuda', en: '/en/help' },
  pricing: { 'pt-AO': '/planos', en: '/en/pricing' },
  download: { 'pt-AO': '/transferir', en: '/en/download' },
  terms: { 'pt-AO': '/termos', en: '/en/terms' },
  privacy: { 'pt-AO': '/privacidade', en: '/en/privacy' },
  cookies: { 'pt-AO': '/cookies', en: '/en/cookies' },
  notFound: { 'pt-AO': '/404', en: '/404' },
  /** Preview-only status page (single language, never in public builds). */
  preview: { 'pt-AO': '/pre-visualizacao', en: '/pre-visualizacao' },
};

export const href = (key: RouteKey, lang: Lang, hash = '') => ROUTES[key][lang] + hash;

/** t('pt', 'en') picker bound to a language. */
export const tr = (lang: Lang) => (pt: string, en: string) => (lang === 'en' ? en : pt);

/** Bilingual string. */
export type L = { 'pt-AO': string; en: string };
export const pick = (l: L, lang: Lang) => l[lang];

export const LANG_LABEL: Record<Lang, { short: string; name: string; ogLocale: string }> = {
  'pt-AO': { short: 'PT', name: 'Português', ogLocale: 'pt_AO' },
  en: { short: 'EN', name: 'English', ogLocale: 'en_GB' },
};
