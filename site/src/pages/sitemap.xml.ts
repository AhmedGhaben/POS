import type { APIRoute } from 'astro';
import { FLAGS, SITE_URL } from '../config';

export const GET: APIRoute = () => {
  const paths = [
    '/',
    '/como-funciona',
    '/demonstracao',
    '/ajuda',
    '/sobre',
    ...(FLAGS.PRICING_PUBLISHED ? ['/planos'] : []),
    ...(FLAGS.DOWNLOAD_PUBLIC ? ['/transferir'] : []),
    ...(FLAGS.LEGAL_APPROVED ? ['/termos', '/privacidade', '/cookies'] : []),
  ];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    paths.map((p) => `  <url><loc>${new URL(p, SITE_URL).href}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
