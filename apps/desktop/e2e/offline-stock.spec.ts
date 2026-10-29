import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { API_URL, connect, launch, outbox, registerTill, SwitchableProxy, tempUserData } from "./helpers";

test.skip(process.env.POS_OFFLINE_STOCK_TESTS !== "1", "Requires isolated test API/database and POS_OFFLINE_STOCK_TESTS=1");
const proxy = new SwitchableProxy(new URL(API_URL));
let prisma: PrismaClient;
test.beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
  expect(database.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(database.pathname).toMatch(/test/);
  expect(new URL(API_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  prisma = new PrismaClient();
  proxy.port = Number(process.env.POS_TEST_PROXY_PORT ?? 55462); await proxy.up();
});
test.afterAll(async () => { await proxy.down(); await prisma?.$disconnect(); });

for (const mode of ["browser", "electron"] as const) for (const loss of ["os-offline", "server-down"] as const) {
  test(`${mode}: ${loss} with fresh zero stock, offline checkout and reconnect`, async ({ request }) => {
    proxy.setMode("pass");
    const registered = await request.post(`${API_URL}/auth/register`, { data: { businessName: "Offline stock test", storeName: "Offline test shop", firstName: "Stock", lastName: "Owner", email: `stock-${mode}-${loss}-${Date.now()}@e2e.test`, password: "OfflineStock123!", language: "en" } });
    expect(registered.status()).toBe(201);
    const session = await registered.json();
    const storeId = session.stores[0].id;
    // Browsers have no native fiscal signing key. Exercise their existing
    // non-fiscal offline checkout; Electron uses real AO till signing below.
    if (mode === "browser") {
      await prisma.business.update({ where: { id: session.user.businessId }, data: { country: "US", currency: "USD" } });
      await prisma.store.update({ where: { id: storeId }, data: { country: "US", pricesIncludeTax: false } });
      Object.assign(session.business, { country: "US", currency: "USD" });
      Object.assign(session.stores[0], { country: "US", pricesIncludeTax: false });
    }
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const category = await request.post(`${API_URL}/categories`, { headers, data: { name: "Offline stock" } });
    const categoryId = (await category.json()).id;
    const made = await request.post(`${API_URL}/products`, { headers, data: { sku: "OFF-STOCK", name: "Offline stock item", categoryId, costPrice: 2, sellPrice: 5, exemptionCode: "M10" } });
    expect(made.status()).toBe(201);
    const product = await made.json();
    expect((await request.put(`${API_URL}/stores/${storeId}/inventory/${product.id}`, { headers, data: { quantity: 0 } })).status()).toBe(200);
    let app: ElectronApplication | undefined;
    const browser = mode === "browser" ? await chromium.launch({ channel: "msedge", headless: true }) : undefined;
    let page: Page;
    if (browser) page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    else { ({ app, page } = await launch(tempUserData())); await connect(page, proxy.url); }
    try {
      const origin = mode === "electron" ? "app://pos" : (process.env.POS_TEST_WEB_URL ?? "http://127.0.0.1:55461");
      await page.goto(`${origin}/login`);
      await page.evaluate((session) => {
        localStorage.setItem("pos-auth", JSON.stringify({ state: { accessToken: session.accessToken, user: session.user, stores: session.stores, business: session.business, currentStoreId: session.stores[0].id, offline: false, permissions: null }, version: 0 }));
        localStorage.setItem("pos-device-role", JSON.stringify({ state: { role: "TILL" }, version: 0 }));
        localStorage.setItem("pos-language", "en");
      }, session);
      if (app) { await page.reload(); await registerTill(page, "Offline stock till"); }
      const levelsReady = page.waitForResponse((res) => res.url().includes("/inventory/levels") && res.status() === 200);
      await page.goto(`${origin}/pos`);
      await levelsReady;
      const float = page.getByLabel("Opening float");
      await float.fill("0"); await page.getByRole("button", { name: "Open the till", exact: true }).click();
      await expect(page.getByTestId("sync-status")).toBeHidden();
      await page.getByRole("button", { name: "Offline stock", exact: true }).click();
      const tile = page.locator("div.grid > button.text-left").filter({ hasText: product.name });
      const quantity = page.getByLabel(`Quantity of ${product.name}`);
      const charge = page.getByRole("button", { name: /^Charge/ });
      // This proves authoritative zero stock is cached before connectivity is lost.
      await tile.click(); await expect(page.getByText(`Only 0 of "${product.name}" in stock`).first()).toBeVisible();
      await expect(quantity).toHaveCount(0); await expect(charge).toBeDisabled();
      if (loss === "os-offline") {
        await page.context().setOffline(true); proxy.setMode("bad-gateway");
        expect(await page.evaluate(() => navigator.onLine)).toBe(false);
      } else {
        proxy.setMode("bad-gateway");
        // An ordinary app query detects failure while navigator.onLine stays true.
        const search = page.getByPlaceholder("Scan barcode or search by name / SKU...");
        await search.fill("Offline stock");
        await expect(page.getByTestId("sync-status")).toContainText("Working offline"); await search.fill("");
        expect(await page.evaluate(() => navigator.onLine)).toBe(true);
      }
      await expect(page.getByTestId("sync-status")).toContainText("Working offline");
      await tile.click(); await expect(quantity).toHaveValue("1");
      await page.getByRole("button", { name: "One more", exact: true }).click(); await expect(quantity).toHaveValue("2");
      await quantity.fill("3"); await quantity.press("Enter"); await expect(quantity).toHaveValue("3");
      await expect(charge).toBeEnabled(); await charge.click();
      const completed = page.getByRole("dialog").filter({ hasText: "Sale complete" });
      await expect(completed).toContainText("Saved offline");
      const offlineDocumentNo = (await completed.textContent())?.match(/FR POS\d+-\d{4}\/\d+/)?.[0];
      if (mode === "electron") await expect(completed).toContainText(/FR POS\d+-\d{4}\/\d+/);
      const queued = (await outbox(page)).filter((entry) => entry.kind === "sale");
      expect(queued).toHaveLength(1); expect(queued[0].state).toBe("pending");
      const before = await request.get(`${API_URL}/sales/store/${storeId}`, { headers });
      expect(await before.json()).toHaveLength(0);
      await page.keyboard.press("Escape");
      // A second, uncharged cart proves overStock itself changes on reconnect.
      await tile.click(); await expect(quantity).toHaveValue("1"); await expect(charge).toBeEnabled();
      const refreshed = page.waitForResponse((res) => res.url().includes("/inventory/levels") && res.status() === 200);
      proxy.setMode("pass");
      if (loss === "os-offline") await page.context().setOffline(false);
      else await page.getByRole("button", { name: "Retry sync", exact: true }).click();
      await refreshed;
      await expect.poll(async () => (await outbox(page)).find((entry) => entry.clientId === queued[0].clientId)?.state).toBe("synced");
      await expect(charge).toBeDisabled();
      await page.getByRole("button", { name: "One more", exact: true }).click(); await expect(quantity).toHaveValue("1");
      const sales = await (await request.get(`${API_URL}/sales/store/${storeId}`, { headers })).json();
      expect(sales).toHaveLength(1); expect(sales[0]).toMatchObject({ clientId: queued[0].clientId, createdOffline: true });
      expect(sales[0].lineItems[0].quantity).toBe("3");
      const inventory = await (await request.get(`${API_URL}/stores/${storeId}/inventory`, { headers })).json();
      expect(inventory.find((item: { productId: string }) => item.productId === product.id).quantity).toBe("-3");
      // The queued client id must correspond to exactly one server sale.
      await page.getByPlaceholder("Scan barcode or search by name / SKU...").fill("OFF-STOCK");
      await expect.poll(async () => (await (await request.get(`${API_URL}/sales/store/${storeId}`, { headers })).json()).length).toBe(1);
      if (mode === "electron") {
        expect(sales[0].fiscalDocuments[0].hashExcerpt).toHaveLength(4);
        expect(sales[0].fiscalDocuments[0].documentNo).toBe(offlineDocumentNo);
      }
      // The business's online overselling choice remains effective in either direction.
      for (const allowed of [true, false]) {
        await page.goto(`${origin}/settings`);
        await page.getByLabel("Allow selling without stock", { exact: true }).setChecked(allowed);
        await page.getByRole("button", { name: "Save settings", exact: true }).click();
        await expect(page.getByText("Settings saved", { exact: false }).first()).toBeVisible();
        await page.goto(`${origin}/pos`);
        if (allowed) {
          await expect(charge).toBeEnabled();
          await page.getByRole("button", { name: "One more", exact: true }).click(); await expect(quantity).toHaveValue("2");
        } else await expect(charge).toBeDisabled();
      }
    } finally { proxy.setMode("pass"); await page.context().setOffline(false).catch(() => {}); await app?.close(); await browser?.close(); }
  });
}
