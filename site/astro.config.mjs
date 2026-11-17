// @ts-check
import { defineConfig } from 'astro/config';

// Static output only. No adapter, no server, no deployment config
// (WEBSITE_SPEC §2): see README.md for hosting requirements.
export default defineConfig({
  site: process.env.SITE_URL || 'https://storbit.example',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  // Structured for i18n: pt-AO at the root, English later under /en/
  // (not shipped in phase A — no English copy has been provided).
  i18n: {
    defaultLocale: 'pt-AO',
    locales: ['pt-AO', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  devToolbar: { enabled: false },
  vite: {
    server: { fs: { allow: ['..'] } },
  },
});
