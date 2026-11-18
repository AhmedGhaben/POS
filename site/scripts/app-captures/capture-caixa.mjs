// Real screenshots of the STORBIT Windows Caixa (Electron build) for the site:
// signs in, registers the till, sells online, cuts the connection, sells
// offline, and captures the till in English and Portuguese; then reconnects
// and waits for the sales to sync. See README.md in this folder.
//
// Usage: node capture-caixa.mjs <outDir>   (API on 127.0.0.1:3000, fresh seed)
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// Only connects over CDP, so any Playwright version works; the repo's is used.
const { chromium } = await import(path.join(ROOT, 'node_modules/playwright/index.mjs'));

const OUT = process.argv[2];
const API = { host: '127.0.0.1', port: Number(process.env.API_PORT ?? 3000) };
// Switchable TCP proxy standing in for the internet connection.
let up = true; const socks = new Set();
const proxy = net.createServer((c) => {
  if (!up) return c.destroy();
  const s = net.connect(API); socks.add(c); socks.add(s);
  c.pipe(s); s.pipe(c);
  for (const x of [c, s]) { x.on('error', () => { c.destroy(); s.destroy(); }); x.on('close', () => socks.delete(x)); }
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
const setUp = (v) => { up = v; for (const s of socks) s.destroy(); };

const userData = mkdtempSync(path.join(os.tmpdir(), 'storbit-cap-'));
const el = spawn(path.join(ROOT, 'node_modules/electron/dist/electron'), ['--no-sandbox', '--remote-debugging-port=9333', path.join(ROOT, 'apps/desktop')], {
  env: { ...process.env, POS_DESKTOP_USER_DATA: userData, POS_DESKTOP_UPDATE_INSTALL_ON_QUIT: '0' }, stdio: 'ignore',
});
let browser;
for (let i = 0; i < 40 && !browser; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); } catch { await new Promise((r) => setTimeout(r, 500)); } }
const ctx = browser.contexts()[0];
let page = ctx.pages()[0] ?? (await ctx.waitForEvent('page'));
await page.setViewportSize({ width: 1440, height: 900 });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (u) => { for (let i = 0; i < 4; i++) { try { await page.goto(u); return; } catch { await page.waitForTimeout(1000); } } await page.goto(u); };
const step = (m) => console.log('STEP', m, page.url());

try {
  await page.waitForLoadState('domcontentloaded');
  step('start');
  await page.locator('input').first().fill(proxyUrl);
  await page.keyboard.press('Enter');
  await page.waitForURL(/^app:\/\/pos\//, { timeout: 30000 });
  await page.waitForLoadState('load'); await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.setItem('pos-language', 'en'));
  await page.reload(); await page.waitForTimeout(1500);
  step('login page');
  const skip = page.getByRole('button', { name: 'Skip for now and sign in' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const emailLink = page.getByRole('button', { name: 'Sign in with email instead' });
  await Promise.race([page.getByLabel('Email').waitFor(), emailLink.waitFor()]);
  if (await emailLink.isVisible()) await emailLink.click();
  await page.getByLabel('Email').fill('owner@demo-store.test');
  await page.getByLabel('Password').fill('OwnerPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  step('signed in');
  await page.waitForTimeout(1500); await go('app://pos/device');
  await page.getByLabel('Till name').fill('Caixa 1');
  await page.getByRole('button', { name: 'Register this till' }).click();
  await page.getByText(/^POS-\d{3}$/).waitFor();
  await page.waitForFunction(async () => (await window.posDesktop.signing.status()).hasKey, null, { timeout: 30000 });
  console.log('SIGNING', JSON.stringify(await page.evaluate(() => window.posDesktop.signing.status())));
  await go('app://pos/pos');
  const unlock = async () => {
    const overlay = page.getByRole('dialog', { name: 'Till locked' });
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.getByRole('button', { name: /Ada/ }).click();
      for (const d of '8642') await page.keyboard.press(d);
      await page.keyboard.press('Enter');
      await overlay.waitFor({ state: 'hidden' });
    }
  };
  await page.waitForTimeout(2500); await unlock();
  const float = page.getByLabel('Opening float');
  const charge = page.getByRole('button', { name: /^Charge/ });
  await Promise.race([float.waitFor(), charge.waitFor()]);
  if (await float.isVisible()) { await float.fill('20000'); await page.getByRole('button', { name: 'Open the till' }).click(); await charge.waitFor(); }
  step('till open');
  await page.waitForTimeout(3000);
  const add = async (cat, name) => { await page.getByRole('button', { name: cat, exact: true }).click(); await page.getByRole('button', { name }).first().click(); };
  const sell = async () => {
    await charge.click();
    try { await page.getByRole('dialog').waitFor({ timeout: 15000 }); } catch (e) { await shot('fail'); throw e; }
    const t = (await page.getByRole('dialog').textContent()) ?? '';
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    return t;
  };
  await add('Beverages', /Orange Juice/); await add('Bakery', /Baguette/); await sell();
  await add('Dairy', /Eggs/); await add('Produce', /Bananas/); await sell();
  await add('Household', /Dish Soap/); await add('Snacks', /Potato Chips/); await sell();
  await add('Dairy', /Butter/); await add('Bakery', /Croissant/); await add('Beverages', /Green Tea/); await sell();
  step('online sales done');
  setUp(false);
  await add('Snacks', /Chocolate Bar/); await add('Produce', /Carrots/);
  const r1 = await sell(); console.log('OFFLINE1', /Saved offline/.test(r1));
  await add('Beverages', /Sparkling Water/); await add('Bakery', /Bagel/);
  const r2 = await sell(); console.log('OFFLINE2', /Saved offline/.test(r2));
  await add('Dairy', /Cheddar/); await add('Produce', /Avocado/); await add('Beverages', /Cold Brew/);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.mouse.move(700, 600);
  await page.getByText(/2 sales waiting to sync/).waitFor({ timeout: 30000 });
  await page.waitForTimeout(5000);
  await shot('caixa-offline-en');
  step('offline captured');
  // Same till, same moment, in Portuguese (the cart and the outbox survive a reload).
  await page.evaluate(() => localStorage.setItem('pos-language', 'pt-AO'));
  await page.reload(); await page.waitForTimeout(2500);
  const lock = page.getByRole('dialog');
  if (await lock.isVisible().catch(() => false)) {
    await lock.getByRole('button', { name: /Ada/ }).click();
    for (const d of '8642') await page.keyboard.press(d);
    await page.keyboard.press('Enter');
    await lock.waitFor({ state: 'hidden' });
  }
  await page.getByText(/2 vendas por enviar/).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Todos', exact: true }).click().catch(() => {});
  await page.mouse.move(700, 600);
  await page.waitForTimeout(5000);
  await shot('caixa-offline-pt');
  step('pt captured');
  setUp(true);
  await page.getByText(/por enviar/).waitFor({ state: 'detached', timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot('caixa-online-pt');
  step('synced');
} catch (e) { console.log('ERROR', e.message.split('\n')[0]); await shot('fail').catch(() => {}); }
await browser.close().catch(() => {});
el.kill(); proxy.close(); setUp(false);
process.exit(0);
