import type { APIRoute } from 'astro';
import { FLAGS, SITE_URL } from '../config';
import { LANGS, ROUTES, type RouteKey } from '../i18n';

export const GET: APIRoute = () => {
  const keys: RouteKey[] = [
    'home',
    'how',
    'demo',
    'help',
    'about',
    ...(FLAGS.PRICING_PUBLISHED ? (['pricing'] as RouteKey[]) : []),
    ...(FLAGS.DOWNLOAD_PUBLIC ? (['download'] as RouteKey[]) : []),
    ...(FLAGS.LEGAL_APPROVED ? (['terms', 'privacy', 'cookies'] as RouteKey[]) : []),
  ];
  const url = (p: string) => new URL(p, SITE_URL).href;
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    keys
      .flatMap((k) =>
        LANGS.map(
          (l) =>
            `  <url><loc>${url(ROUTES[k][l])}</loc>` +
            LANGS.map((a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${url(ROUTES[k][a])}"/>`).join('') +
            '</url>',
        ),
      )
      .join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
