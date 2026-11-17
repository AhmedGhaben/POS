import type { APIRoute } from 'astro';
import { INDEXABLE, SITE_URL } from '../config';

// Not discoverable until SITE_INDEXABLE=true (never in preview builds).
export const GET: APIRoute = () =>
  new Response(
    INDEXABLE
      ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', SITE_URL).href}\n`
      : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
