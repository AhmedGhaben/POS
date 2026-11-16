// Screenshot harness only. No application source changes or real API/server.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const out = __dirname;
const dist = path.resolve(out, '../../../apps/web/dist');
const origin = 'https://storbit-preview.invalid';
const business = { id: 'synthetic-business', name: 'Synthetic preview shop', plan: 'PRO', country: 'AO', currency: 'AOA', language: 'en', defaultTaxRate: '14', emailEnabled: false, aiInsightsEnabled: false, logoUrl: null, taxId: null, receiptHeader: null, receiptFooter: null, maxDiscountPercent: null, allowSellingWithoutStock: true };
const store = { id: 'synthetic-store', businessId: business.id, name: 'Synthetic store', country: 'AO', ivaRegime: 'GENERAL', pricesIncludeTax: true, timezone: 'Africa/Luanda', isActive: true };
const user = { id: 'synthetic-owner', businessId: business.id, firstName: 'Preview', lastName: 'Owner', email: 'owner@synthetic.invalid', role: 'OWNER', emailVerified: true, language: 'en' };
const products = ['Notebook', 'Pencil set', 'Desk organiser', 'Water bottle', 'Canvas bag', 'Weekly planner'].map((name, i) => ({ id: `synthetic-product-${i}`, businessId: business.id, name, sku: `PREVIEW-${i}`, categoryId: 'synthetic-category', costPrice: '100', sellPrice: String(250 + i * 125), unit: 'un', taxRate: '14', trackStock: false, isActive: true, reorderLevel: '0', photoUrl: null }));
const network = [], errors = [], screenshots = [];
function fixture(p) {
  if (p === '/api/businesses/me') return business;
  if (p === '/api/users/me/permissions') return { permissions: {}, role: 'OWNER', overrides: [] };
  if (p === '/api/products') return products;
  if (p === '/api/categories') return [{ id: 'synthetic-category', name: 'Stationery', businessId: business.id }];
  if (p === '/api/shifts/current') return { shift: null };
  if (p.endsWith('/summary')) return { revenue: 18500, profit: 7200, orderCount: 24, avgOrderValue: 770.83, revenueDeltaPct: 8, profitDeltaPct: 4, orderCountDeltaPct: 5, avgOrderValueDeltaPct: 3 };
  if (p.endsWith('/sales-trend')) return Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, revenue: 1500 + i * 300, orderCount: 3 + i }));
  if (p.endsWith('/top-products')) return products.slice(0, 3).map((p, i) => ({ productId: p.id, name: p.name, quantitySold: 8 - i, revenue: (8 - i) * Number(p.sellPrice) }));
  if (p.endsWith('/low-stock') || p.endsWith('/store-comparison')) return [];
  return undefined;
}
(async () => {
  let browser;
  try {
    // Keep browser sandbox enabled. Never launch Electron or attach to a profile.
    browser = await chromium.launch({ channel: 'msedge', headless: true, chromiumSandbox: true, timeout: 20000 });
    for (const width of [1366, 1024]) for (const [screen, theme] of [['login', 'light'], ['pos', 'light'], ['pos', 'dark'], ['dashboard', 'light'], ['dashboard', 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 768 }, serviceWorkers: 'block' });
      await context.route('**/*', async route => {
        const request = route.request(), u = new URL(request.url());
        if (u.origin !== origin) { network.push({ url: u.href, action: 'blocked-external' }); return route.abort(); }
        if (u.pathname.startsWith('/api/')) {
          const value = request.method() === 'GET' ? fixture(u.pathname) : undefined;
          network.push({ path: u.pathname, method: request.method(), action: value === undefined ? 'unmapped-denied' : 'synthetic-fixture' });
          return route.fulfill({ status: value === undefined ? 404 : 200, contentType: 'application/json', body: JSON.stringify(value === undefined ? { message: 'Preview: request denied' } : value) });
        }
        const file = path.resolve(dist, '.' + u.pathname);
        const safe = file.startsWith(dist + path.sep);
        const target = safe && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
        const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(target)] || 'application/octet-stream';
        return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(target) });
      });
      await context.addInitScript(({ theme, screen, business, store, user }) => {
        localStorage.setItem('pos-theme', theme);
        localStorage.setItem('pos-language', 'en');
        localStorage.setItem('pos-device-role', JSON.stringify({ state: { role: 'TILL' }, version: 0 }));
        if (screen !== 'login') localStorage.setItem('pos-auth', JSON.stringify({ state: { accessToken: 'SYNTHETIC_NOT_A_REAL_TOKEN', user, stores: [store], currentStoreId: store.id, business, permissions: {}, offline: false }, version: 0 }));
      }, { theme, screen, business, store, user });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push({ screen, theme, width, message: e.message }));
      await page.goto(`${origin}/${screen}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(800);
      const name = `${screen}-${theme}-${width}x768.png`;
      await page.screenshot({ path: path.join(out, name), fullPage: true });
      screenshots.push({ name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 3500), horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
      await context.close();
    }
  } catch (e) { errors.push({ launchOrCaptureError: e.stack }); process.exitCode = 1; }
  finally {
    if (browser) await browser.close();
    fs.writeFileSync(path.join(out, 'preview-results.json'), JSON.stringify({ syntheticOnly: true, source: 'existing apps/web/dist build', screenshots, network, errors }, null, 2));
  }
})();
