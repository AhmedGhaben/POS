// Review evidence only. Runs the existing Electron build against the isolated API.
const { _electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const stage = process.argv[2] || 'baseline';
const out = path.resolve(__dirname, stage, 'screenshots');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'storbit-visual-'));
fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ serverUrl: 'http://localhost:4100' }));
const env = { ...process.env, POS_DESKTOP_USER_DATA: profile, POS_DESKTOP_UPDATE_INSTALL_ON_QUIT: '0' };
delete env.ELECTRON_RUN_AS_NODE;
(async () => {
  const app = await _electron.launch({ args: [path.resolve(__dirname, '../../apps/desktop')], env });
  const findings = [];
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const session = await page.evaluate(async () => {
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName: 'Visual review synthetic shop', storeName: 'Visual review store', firstName: 'Visual', lastName: 'Reviewer', email: `visual-${Date.now()}@e2e.test`, password: 'VisualReview123!' }) });
      if (!res.ok) throw new Error(`Synthetic registration: ${res.status}`);
      return res.json();
    });
    for (const width of [1024, 1366]) for (const theme of ['light', 'dark']) for (const language of ['en', 'pt-AO']) {
      await app.evaluate(({ BrowserWindow }, width) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(800, 600); win.setContentSize(width, 768); }, width);
      for (const route of ['login', 'dashboard', 'products', 'pos']) {
        await page.evaluate(({ theme, language, session, route }) => {
          localStorage.setItem('pos-theme', theme);
          localStorage.setItem('pos-language', language);
          localStorage.setItem('pos-touch-mode', JSON.stringify({ state: { enabled: true }, version: 0 }));
          if (route === 'login') localStorage.removeItem('pos-auth');
          else localStorage.setItem('pos-auth', JSON.stringify({ state: { ...session, currentStoreId: session.stores[0].id, user: { ...session.user, language }, permissions: null, offline: false }, version: 0 }));
        }, { theme, language, session, route });
        await page.goto(`app://pos/${route}`);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(out, `${route}-${width}-${theme}-${language}-touch.png`) });
        findings.push(await page.evaluate(({ route, width, theme, language }) => ({ route, width, theme, language, actualRoute: location.pathname, viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth, touch: document.documentElement.classList.contains('touch') }), { route, width, theme, language }));
      }
    }
    fs.writeFileSync(path.join(out, 'findings.json'), JSON.stringify(findings, null, 2));
    console.log(`Captured ${findings.length} Electron screenshots`);
  } finally { await app.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
