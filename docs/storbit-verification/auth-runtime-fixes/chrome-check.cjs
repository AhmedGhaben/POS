const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const baseline = process.argv.includes('--baseline');
const dist = path.resolve(__dirname, '../../../apps/web/dist');
const origin = 'https://storbit-auth.invalid';
const results = [];
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: 'C:/Users/ASUS/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true, timeout: 20000 });
    for (const route of ['login', 'signup']) for (const width of (baseline ? [1366] : [1366, 390])) for (const theme of (baseline ? ['light'] : ['light', 'dark'])) for (const language of (baseline ? ['en'] : ['en', 'pt-AO'])) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
      await context.route('**/*', async request => {
        const url = new URL(request.request().url());
        if (url.origin !== origin || url.pathname.startsWith('/api/')) return request.abort();
        const candidate = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
        const file = candidate.startsWith(dist + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(dist, 'index.html');
        return request.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff': 'font/woff' })[path.extname(file)] || 'application/octet-stream' });
      });
      await context.addInitScript(({ theme, language }) => {
        localStorage.setItem('pos-theme', theme); localStorage.setItem('pos-language', language);
        window.animationEvents = [];
        document.addEventListener('animationstart', e => window.animationEvents.push({ name: e.animationName, target: e.target.className.baseVal || e.target.className, at: performance.now() }), true);
      }, { theme, language });
      const page = await context.newPage();
      await page.goto(`${origin}/${route}`, { waitUntil: 'load' });
      await page.waitForSelector('.language button');
      const samples = [];
      for (const delay of [0, 180, 250, 400, 800]) {
        await page.waitForTimeout(delay);
        samples.push(await page.evaluate(() => {
          const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
          const sample = selector => { const el = document.querySelector(selector); if (!el) return null; const s = getComputedStyle(el); return { rect: rect(el), name: s.animationName, duration: s.animationDuration, opacity: s.opacity, dash: s.strokeDashoffset, display: s.display, minHeight: s.minHeight, boxSizing: s.boxSizing }; };
          return { at: performance.now(), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, entrance: document.querySelector('main')?.dataset.authEntrance, events: window.animationEvents, language: sample('.language'), buttons: [...document.querySelectorAll('.language button')].map(el => ({ rect: rect(el), minHeight: getComputedStyle(el).minHeight })), theme: sample('.auth-theme-toggle'), dashboard: sample('.dashboard'), chart: sample('.chart-line'), storefront: sample('.storefront'), benefits: [...document.querySelectorAll('.signup-benefits li')].map(el => ({ opacity: getComputedStyle(el).opacity, name: getComputedStyle(el).animationName })) };
        }));
      }
      const result = { route, width, theme, language, samples };
      results.push(result);
      if (!baseline) {
        const final = samples.at(-1);
        assert.equal(final.language.rect.height, 40);
        assert.equal(final.theme.rect.height, 40);
        assert.equal(final.language.rect.y, final.theme.rect.y);
        for (const { rect } of final.buttons) { assert.ok(rect.y >= final.language.rect.y + 1); assert.ok(rect.bottom <= final.language.rect.bottom - 1); }
        if (width > 760) {
          assert.ok(final.events.some(e => e.name === 'storbit-enter'));
          if (route === 'login') { assert.ok(final.events.some(e => e.name === 'storbit-chart')); assert.equal(final.chart.duration, '0.7s'); assert.equal(parseFloat(final.chart.dash), 0); assert.ok(samples.some(s => parseFloat(s.chart.dash) > 0 && parseFloat(s.chart.dash) < 1000)); }
          else assert.equal(final.events.filter(e => e.name === 'storbit-enter').length, 4);
        } else assert.equal(final.events.length, 0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(500);
        result.reduced = await page.evaluate(() => ({ events: window.animationEvents, entrance: document.querySelector('main')?.dataset.authEntrance, name: getComputedStyle(document.querySelector('.dashboard,.storefront')).animationName }));
        assert.equal(result.reduced.events.length, 0);
        assert.equal(result.reduced.name, 'none');
      }
      await context.close();
    }
    console.log(`PASS ${results.length} browser cases`);
  } catch (error) { results.push({ error: String(error.stack) }); process.exitCode = 1; console.log(String(error)); }
  finally { if (browser) await browser.close(); fs.writeFileSync(path.join(__dirname, baseline ? 'chrome-baseline.json' : 'chrome-final.json'), JSON.stringify(results, null, 2)); }
})();
