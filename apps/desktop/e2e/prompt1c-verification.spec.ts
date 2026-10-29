import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import fs from "node:fs";
import path from "node:path";
import { API_URL, connect, launch, tempUserData } from "./helpers";
const pt = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../web/src/locales/pt-PT/pos.json"), "utf8"));
const common = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../web/src/locales/pt-PT/common.json"), "utf8"));
test.skip(process.env.POS_FINAL_1C_TESTS !== "1", "Requires isolated final verification API/database");
for (const mode of ["browser", "electron"] as const) test(`${mode}: 1c layouts, quotes, SKU/prices, print toggle and accountant navigation`, async ({ request }) => {
  const dbUrl = new URL(process.env.DATABASE_URL!); expect(dbUrl.hostname).toBe("127.0.0.1"); expect(dbUrl.pathname).toContain("test");
  const prisma = new PrismaClient();
  const registered = await request.post(`${API_URL}/auth/register`, { data: { businessName: "Final UI verification", storeName: "Final UI shop", firstName: "Test", lastName: "Owner", email: `verify-${mode}-${Date.now()}@e2e.test`, password: "FinalVerify123!", language: "en" } });
  expect(registered.status()).toBe(201); const session = await registered.json();
  const headers = { Authorization: `Bearer ${session.accessToken}` }; const storeId = session.stores[0].id;
  const category = await (await request.post(`${API_URL}/categories`, { headers, data: { name: "Verification", skuPrefix: "VRF" } })).json();
  const product = await (await request.post(`${API_URL}/products`, { headers, data: { name: "Verification item", sku: "BASE", categoryId: category.id, costPrice: 2, sellPrice: 5, exemptionCode: "M10" } })).json();
  expect((await request.put(`${API_URL}/stores/${storeId}/inventory/${product.id}`, { headers, data: { quantity: 20 } })).status()).toBe(200);
  expect((await request.post(`${API_URL}/customers`, { headers, data: { name: "Quote Customer", taxId: "5000123456", address: "Rua Teste 12", city: "Luanda" } })).status()).toBe(201);
  let app: ElectronApplication | undefined; const browser = mode === "browser" ? await chromium.launch({ channel: "msedge", headless: true }) : undefined; let page: Page;
  if (browser) page = await browser.newPage(); else { ({ app, page } = await launch(tempUserData())); await connect(page, API_URL); }
  const origin = mode === "browser" ? process.env.POS_TEST_WEB_URL! : "app://pos";
  async function install(s: typeof session, language: string) {
    await page.goto(`${origin}/login`);
    await page.evaluate(({ s, language }) => { localStorage.setItem("pos-auth", JSON.stringify({ state: { accessToken: s.accessToken, user: s.user, business: s.business, stores: s.stores, currentStoreId: s.stores[0]?.id, permissions: null, offline: false }, version: 0 })); localStorage.setItem("pos-language", language); localStorage.setItem("pos-device-role", JSON.stringify({ state: { role: "TILL" }, version: 0 })); }, { s, language });
  }
  try {
    await install(session, "en"); await page.goto(`${origin}/products`);
    await page.getByRole("button", { name: "New product", exact: true }).click(); const form = page.getByRole("dialog");
    await form.getByLabel("Category", { exact: true }).click(); await page.getByRole("option", { name: "Verification", exact: true }).click();
    await expect(form.getByLabel("SKU")).toHaveValue("VRF-001"); await form.getByLabel("SKU").fill("VRF-OVERRIDE");
    await form.getByLabel("Name", { exact: true }).fill("Policy verification"); await form.getByLabel("Cost price").fill("-1"); await form.getByLabel("Sell price").fill("3");
    await form.getByRole("button", { name: "Save product", exact: true }).click(); await expect(form.getByLabel("Cost price")).toHaveAttribute("aria-invalid", "true");
    await form.getByLabel("Cost price").fill("0"); await form.getByLabel("Sell price").fill("0"); await form.getByRole("button", { name: "Save product", exact: true }).click();
    await expect(form.getByText('Enter a price above 0, or tick "Free item"')).toBeVisible(); await form.getByLabel("Free item", { exact: true }).check();
    await expect(form.getByLabel("Sell price")).toBeDisabled(); await form.getByLabel("Free item", { exact: true }).uncheck(); await form.getByLabel("Sell price").fill("3");
    await form.getByRole("button", { name: "Save product", exact: true }).click(); await expect(form).toBeHidden();
    const saved = await (await request.get(`${API_URL}/products?search=VRF-OVERRIDE`, { headers })).json(); expect(saved[0]).toMatchObject({ sku: "VRF-OVERRIDE", costPrice: "0" }); // Pending policy; deliberately preserved.
    await page.goto(`${origin}/pos`); await page.getByLabel("Opening float").fill("0"); await page.getByRole("button", { name: "Open the till", exact: true }).click();
    await page.evaluate(() => { const auth = JSON.parse(localStorage.getItem("pos-auth")!); auth.state.user.language = "pt-PT"; localStorage.setItem("pos-auth", JSON.stringify(auth)); localStorage.setItem("pos-language", "pt-PT"); }); await page.reload();
    await page.getByRole("button", { name: "Verification", exact: true }).click();
    const zeroTile = page.locator("div.grid > button.text-left").filter({ hasText: "Policy verification" });
    await expect(zeroTile).toHaveCount(1);
    const hideZero = page.getByRole("button", { name: pt.view.hideOutOfStock, exact: true });
    await hideZero.click(); await expect(zeroTile).toHaveCount(0);
    await page.reload(); await page.getByRole("button", { name: "Verification", exact: true }).click();
    await expect(hideZero).toHaveAttribute("aria-pressed", "true"); await expect(zeroTile).toHaveCount(0);
    await hideZero.click(); await expect(zeroTile).toHaveCount(1);
    for (const [width, height] of [[1024, 768], [1366, 768], [1280, 800]]) {
      if (app) await app.evaluate(({ BrowserWindow }, { width, height }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(800, 600); win.setContentSize(width, height); }, { width, height }); else await page.setViewportSize({ width, height });
      await page.getByRole("button", { name: "Verification", exact: true }).click(); await page.locator("div.grid > button.text-left").filter({ hasText: "Verification item" }).click();
      await page.getByRole("button", { name: pt.payment.split, exact: true }).click();
      const panel = page.getByTestId("checkout-panel");
      for (const rows of [2, 3]) {
        if (rows === 3) await panel.getByRole("button", { name: pt.payment.addMethod, exact: true }).click();
        expect(await panel.evaluate((root) => { const box = root.getBoundingClientRect(); return [...root.querySelectorAll<HTMLElement>("button,label,p,select,input")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1 || (el.tagName !== "INPUT" && el.scrollWidth > el.clientWidth + 1)); }).map((el) => el.textContent); })).toEqual([]);
      }
      await panel.getByRole("button", { name: pt.payment.cancelSplit, exact: true }).click();
      for (const route of ["products", "inventory", "shifts"]) {
        await page.goto(`${origin}/${route}`); await page.locator("main h1").first().waitFor();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const aside = page.locator("aside"); if (await aside.isVisible()) await expect(aside.getByRole("link", { name: common.nav.pointOfSale, exact: true })).toBeInViewport();
      }
      await page.goto(`${origin}/pos`);
    }
    await page.getByRole("combobox", { name: pt.customer.walkIn, exact: true }).click(); await page.getByPlaceholder(pt.customer.search).fill("Quote Customer"); await page.getByRole("option", { name: /^Quote Customer/ }).click();
    await page.getByRole("button", { name: pt.checkout.printQuote, exact: true }).click(); const quote = page.getByRole("dialog");
    await expect(quote.locator("#quote-tax-id")).toHaveValue("5000123456"); await expect(quote.locator("#quote-address")).toHaveValue(/Rua Teste 12/);
    await quote.getByRole("tab", { name: pt.quote.a4, exact: true }).click(); await expect(quote).toContainText("Quote Customer"); await expect(quote).toContainText("5000123456"); await expect(quote).toContainText("Rua Teste 12");
    await quote.locator("#quote-tax-id").fill("5000999888"); await quote.locator("#quote-for").fill("One-off buyer"); await expect(quote).toContainText("5000999888"); await page.keyboard.press("Escape");
    expect(await (await request.get(`${API_URL}/sales/store/${storeId}`, { headers })).json()).toHaveLength(0);
    await page.getByRole("button", { name: /^Cobrar/ }).click(); const complete = page.getByRole("dialog");
    await complete.getByRole("tab", { name: "A4", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText(/FR /);
    await page.getByRole("dialog").getByRole("tab", { name: pt.complete.receiptFormat, exact: true }).click(); await expect(page.getByRole("dialog").getByRole("tab", { name: pt.complete.receiptFormat, exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("dialog").getByRole("tab", { name: "A4", exact: true }).click(); await page.keyboard.press("Escape"); await page.reload();
    await page.getByRole("button", { name: "Verification", exact: true }).click(); await page.locator("div.grid > button.text-left").filter({ hasText: "Verification item" }).click(); await page.getByRole("button", { name: /^Cobrar/ }).click();
    await expect(page.getByRole("dialog").getByRole("tab", { name: "A4", exact: true })).toHaveAttribute("aria-selected", "true"); await page.keyboard.press("Escape");
    const email = `accountant-${mode}-${Date.now()}@e2e.test`;
    const accountant = await prisma.user.create({ data: { businessId: session.user.businessId, email, passwordHash: await bcrypt.hash("FinalVerify123!", 10), firstName: "Accountant", lastName: "Test", role: "ACCOUNTANT", emailVerifiedAt: new Date() } });
    await prisma.accountantAccess.create({ data: { businessId: session.user.businessId, userId: accountant.id, invitedById: session.user.id, acceptedAt: new Date() } });
    const logged = await request.post(`${API_URL}/auth/login`, { data: { email, password: "FinalVerify123!" } }); expect(logged.status()).toBe(200);
    await install(await logged.json(), "en"); await page.goto(`${origin}/products`); await page.locator("main h1").first().waitFor();
    await expect(page.getByRole("button", { name: "Back to POS", exact: true })).toHaveCount(0); await expect(page.getByRole("link", { name: "Back to POS", exact: true })).toHaveCount(0);
  } finally { await app?.close(); await browser?.close(); await prisma.$disconnect(); }
});
