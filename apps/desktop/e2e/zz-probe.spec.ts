import { test } from "@playwright/test";
import { API_URL, connect, launch, login, SwitchableProxy, tempUserData } from "./helpers";
test("probe sidebar", async () => {
  const proxy = new SwitchableProxy(new URL(API_URL)); await proxy.up();
  const { app, page } = await launch(tempUserData());
  await connect(page, proxy.url);
  await login(page);
  await page.evaluate(() => localStorage.setItem("pos-language", "pt-PT")); await page.reload();
  console.log("lang", await page.evaluate(() => document.documentElement.lang));
  for (const [w, h] of [[1280, 800]]) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(800, 600); win.setContentSize(w, h); }, [w, h]);
    for (const [zoom, font] of [[1.25, "115%"]] as const) for (const p of ["products"]) {
      await app.evaluate(({ BrowserWindow }, z) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z), zoom);
      await page.goto("app://pos/" + p); await page.waitForTimeout(1500);
      await page.evaluate((f) => { document.documentElement.style.fontSize = f; }, font); await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({ iw: innerWidth, sw: document.documentElement.scrollWidth, aside: document.querySelector("aside")?.getBoundingClientRect().width ?? 0, asideVisible: !!document.querySelector("aside")?.offsetParent, navScroll: (() => { const n = document.querySelector("aside nav"); return n ? n.scrollHeight - n.clientHeight : null; })(), headerWrap: document.querySelector("header")?.scrollWidth! > document.querySelector("header")?.clientWidth!, main: document.querySelector("main")?.getBoundingClientRect().width }));
      console.log(w, h, zoom, font, p, JSON.stringify(m));
      console.log(await page.evaluate(() => { const out: string[] = []; const W = innerWidth; document.querySelectorAll("body *").forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > W + 2 && el.parentElement && el.parentElement.getBoundingClientRect().right <= W + 2) out.push(el.tagName + "." + (el.className as string).toString().slice(0, 80) + " right=" + Math.round(r.right)); }); return out.slice(0, 15).join(" | ") + " || body " + document.body.scrollWidth + " html overflow " + getComputedStyle(document.documentElement).overflowX + "/" + getComputedStyle(document.body).overflowX; }));
      { const file = "C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-project-main/59d2440a-6f66-460f-a103-be7d843ab02a/scratchpad/" + p + "-" + w + ".png"; await app.evaluate(async ({ BrowserWindow }, file) => { const img = await BrowserWindow.getAllWindows()[0].webContents.capturePage(); return img.toPNG().toString("base64"); }, file).then((b64) => require("fs").writeFileSync(file, Buffer.from(b64, "base64"))); }
    }
  }
  await app.close(); await proxy.down();
});
