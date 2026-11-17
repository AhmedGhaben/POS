// Renders public/og.png (1200×630): STORBIT logo on graphite. Run once after
// a brand change: node scripts/og-image.mjs
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
let pw;
try { pw = await import('playwright'); } catch { pw = await import(`${execSync('npm root -g').toString().trim()}/playwright/index.mjs`); }
const logo = readFileSync(new URL('../../docs/brand/logo/storbit-logo-on-dark.svg', import.meta.url), 'utf8');
const font = readFileSync(new URL('../public/fonts/inter-latin-wght-normal.woff2', import.meta.url)).toString('base64');
const html = `<!doctype html><html><head><style>
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
body{margin:0;width:1200px;height:630px;background:#15171B;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box;font-family:Inter}
svg{width:420px;height:auto}
p{color:#F2EFE8;font-size:40px;font-weight:800;letter-spacing:-0.03em;margin:48px 0 0;max-width:900px;line-height:1.15}
</style></head><body>${logo}<p>Software de caixa feito para as lojas de Angola.</p></body></html>`;
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
await b.close();
console.log('public/og.png written');
