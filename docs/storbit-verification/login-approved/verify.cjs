const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const origin = 'https://storbit-login.invalid';
const dist = path.resolve(__dirname, '../../../apps/web/dist');
(async () => {
 let browser;
 const results = [], errors = [], requests = [];
 try {
  browser = await chromium.launch({channel:'msedge', headless:true, chromiumSandbox:true, timeout:20000});
  for (const width of [1366,1024,390,320]) for (const theme of ['light','dark']) for (const language of ['en','pt-PT']) {
   const context = await browser.newContext({viewport:{width,height:768},serviceWorkers:'block'});
   await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if(u.origin !== origin) return route.abort();
    if(u.pathname.startsWith('/api/')) {
     requests.push({path:u.pathname, method:route.request().method()});
     return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Synthetic sign-in error'})});
    }
    const candidate=path.resolve(dist,'.'+u.pathname);
    const target=candidate.startsWith(dist+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,'index.html');
    return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.woff':'font/woff'})[path.extname(target)]||'application/octet-stream',body:fs.readFileSync(target)});
   });
   await context.addInitScript(({theme,language})=>{localStorage.setItem('pos-theme',theme);localStorage.setItem('pos-language',language);},{theme,language});
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/login',{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.brand-top img').count(),1);
   assert.equal(await page.locator('.login-language').count(),1);
   assert.equal(await page.locator('.dashboard').isVisible(),width>760);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
   const password=page.locator('#password');
   await page.locator('#email').fill('preview@synthetic.invalid');
   await password.fill('synthetic-password');
   const count=requests.length;
   await page.locator('.password-toggle').click();
   assert.equal(await password.getAttribute('type'),'text');
   assert.equal(await password.inputValue(),'synthetic-password');
   assert.equal(requests.length,count,'visibility must not submit');
   await page.locator('.password-toggle').click();
   assert.equal(await password.getAttribute('type'),'password');
   assert.equal(await page.locator('#email').getAttribute('autocomplete'),'username');
   assert.equal(await password.getAttribute('autocomplete'),'current-password');
   assert.equal(await page.locator('a[href="/forgot-password"]').count(),1);
   assert.equal(await page.locator('a[href="/signup"]').count(),1);
   const color=await page.locator('.signin').evaluate(e=>getComputedStyle(e).backgroundColor);
   assert.equal(color,theme==='dark'?'rgb(237, 235, 255)':'rgb(15, 18, 33)');
   const file=`login-${theme}-${language}-${width}.png`;
   await page.screenshot({path:path.join(__dirname,file),fullPage:true});
   await page.locator('.signin').click();
   await page.getByRole('alert').waitFor();
   assert.equal(await page.getByRole('alert').innerText(),'Synthetic sign-in error');
   assert.equal(await page.locator('.signin').isDisabled(),false);
   await page.locator('.language select').selectOption('pt-BR');
   assert.equal(await page.evaluate(()=>localStorage.getItem('pos-language')),'pt-BR');
   await page.locator('.language button').click();
   assert.equal(await page.locator('#login-heading').innerText(),'Welcome back.');
   results.push({width,theme,language,file,color,overflow:false});
   await context.close();
  }
  assert.equal(errors.length,0);
 } catch(e) {errors.push(e.stack);process.exitCode=1;}
 finally {if(browser)await browser.close();fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({results,errors,requests},null,2));console.log(JSON.stringify({cases:results.length,errors},null,2));}
})();
