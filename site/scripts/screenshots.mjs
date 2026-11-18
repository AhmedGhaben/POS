// Captures desktop (1440) and mobile (390) full-page screenshots of a built
// site served at BASE_URL (default http://localhost:4321).
// Usage: npm run build:preview && npx astro preview & ; npm run screenshots -- [outDir] [pages...]
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const [outDir = 'screenshots', ...only] = process.argv.slice(2);
const pages = only.length
  ? only
  : ['/', '/como-funciona', '/sobre', '/demonstracao', '/ajuda', '/planos', '/transferir', '/privacidade', '/404', '/pre-visualizacao',
     '/en', '/en/how-it-works', '/en/about', '/en/demo', '/en/help', '/en/pricing', '/en/download', '/en/privacy'];
const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const scale = Number(process.env.SCALE || 1);
mkdirSync(outDir, { recursive: true });
// Use a local playwright if installed, otherwise the globally installed one.
let pw;
try {
  pw = await import('playwright');
} catch {
  const root = execSync('npm root -g').toString().trim();
  pw = await import(`${root}/playwright/index.mjs`);
}
const browser = await pw.chromium.launch();
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const p of pages) {
    const res = await page.goto(BASE + p, { waitUntil: 'networkidle' });
    if (!res || (res.status() >= 400 && p !== '/404')) { console.warn('skip', p, res?.status()); continue; }
    await page.evaluate(async () => {
      document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible'));
      const imgs = [...document.querySelectorAll('img')];
      imgs.forEach((i) => (i.loading = 'eager'));
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) console.warn(`horizontal overflow on ${p} at ${s.width}px`);
    const base = `${outDir}/${s.name}${p === '/' ? '-inicio' : p.replace(/\//g, '-')}`;
    await page.waitForTimeout(400);
    // First screen as a visitor sees it (with the phone bottom bar)…
    await page.screenshot({ path: `${base}-viewport.png` });
    // …then the full page without the fixed bar repeated mid-page.
    await page.addStyleTag({ content: '[data-mobile-bar]{display:none!important}' });
    const file = `${base}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
