// Gestão (browser back office) dashboard, in English and Portuguese, with
// the data left by capture-caixa.mjs. Web app on http://localhost:5173.
// Usage: node capture-gestao.mjs <outDir>
import { execSync } from 'node:child_process';
// Launches a browser, so use a Playwright whose browsers are installed:
// the global one if present, else the repo's.
let pw;
try { pw = await import(`${execSync('npm root -g').toString().trim()}/playwright/index.mjs`); } catch { pw = await import('playwright'); }
const { chromium } = pw;
const OUT = process.argv[2];
const b = await chromium.launch();
for (const lang of ['en', 'pt-AO']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript((l) => localStorage.setItem('pos-language', l), lang);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/login');
  await p.locator('input[type=email]').fill('owner@demo-store.test');
  await p.locator('input[type=password]').fill('OwnerPass123!');
  await p.keyboard.press('Enter');
  await p.waitForURL(/dashboard/);
  await p.waitForTimeout(9000); // charts settle, "ready to work offline" toast goes
  await p.screenshot({ path: `${OUT}/gestao-${lang === 'en' ? 'en' : 'pt'}.png` });
  console.log('dash', lang);
  await ctx.close();
}
await b.close();
