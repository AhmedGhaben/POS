const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dist = path.resolve(__dirname, '../../../apps/web/dist');
app.enableSandbox();
app.setPath('userData', path.join(__dirname, 'isolated-browser-profile'));
protocol.registerSchemesAsPrivileged([{ scheme: 'storbit-ui-test', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const results = [];
app.whenReady().then(async () => {
  protocol.handle('storbit-ui-test', request => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const candidate = path.resolve(dist, '.' + pathname);
    const file = candidate.startsWith(dist + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(dist, 'index.html');
    let body = fs.readFileSync(file);
    if (file.endsWith('index.html')) body = Buffer.from(body.toString().replace('<head>', `<head><script>
      localStorage.clear(); localStorage.setItem('pos-theme', new URL(location.href).searchParams.get('theme') || 'light');
      localStorage.setItem('pos-language', new URL(location.href).searchParams.get('lang') || 'en');
      window.animationEvents = []; window.runtimeErrors = [];
      document.addEventListener('animationstart', e => animationEvents.push({name:e.animationName, target:e.target.className.baseVal || e.target.className, at:performance.now()}), true);
      window.addEventListener('error', e => runtimeErrors.push(e.message));
    </script>`));
    return new Response(body, { headers: { 'content-type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff': 'font/woff' })[path.extname(file)] || 'application/octet-stream' } });
  });
  try {
    for (const route of ['login', 'signup']) {
      const win = new BrowserWindow({ show: false, width: 1366, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      win.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
      await win.loadURL(`storbit-ui-test://ui/${route}?theme=light&lang=en`);
      for (const delay of [50, 200, 400, 700]) {
        await new Promise(resolve => setTimeout(resolve, delay));
        results.push(await win.webContents.executeJavaScript(`(() => {
          const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
          const sample = selector => {const el=document.querySelector(selector);if(!el)return null;const s=getComputedStyle(el);return {rect:rect(el),name:s.animationName,duration:s.animationDuration,opacity:s.opacity,dash:s.strokeDashoffset,minHeight:s.minHeight,boxSizing:s.boxSizing}};
          return {route:location.pathname,at:performance.now(),media:matchMedia('(prefers-reduced-motion: reduce)').matches,entrance:document.querySelector('main')?.dataset.authEntrance,events:animationEvents,errors:runtimeErrors,language:sample('.language'),buttons:[...document.querySelectorAll('.language button')].map(el=>({rect:rect(el),minHeight:getComputedStyle(el).minHeight})),dashboard:sample('.dashboard'),chart:sample('.chart-line'),storefront:sample('.storefront'),benefit:sample('.signup-benefits li')};
        })()`));
      }
      win.destroy();
    }
    fs.writeFileSync(path.join(__dirname, 'runtime-baseline.json'), JSON.stringify(results, null, 2));
  } catch (error) { fs.writeFileSync(path.join(__dirname, 'runtime-error.txt'), String(error.stack)); process.exitCode = 1; }
  app.exit(process.exitCode || 0);
}).catch(error => { fs.writeFileSync(path.join(__dirname, 'runtime-error.txt'), String(error.stack)); app.exit(1); });
