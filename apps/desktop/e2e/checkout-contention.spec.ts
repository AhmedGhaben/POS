import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { API_URL, connect, launch, outbox, registerTill, tempUserData } from "./helpers";

test.skip(process.env.POS_CONTENTION_TESTS !== "1", "Requires isolated PostgreSQL/API and POS_CONTENTION_TESTS=1");
let db: PrismaClient;
test.beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/); expect(url.pathname).toContain("test");
  expect(new URL(API_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  db = new PrismaClient();
});
test.afterAll(async () => { await db?.$disconnect(); });

for (const mode of ["browser", "electron"] as const) {
  test(`${mode}: stock contention keeps cart online, then cashier retries exactly once`, async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/register`, { data: { businessName: "Contention regression", storeName: "Test shop", firstName: "Test", lastName: "Owner", email: `contention-${mode}-${Date.now()}@e2e.test`, password: "Contention123!", language: "en" } });
    expect(response.status()).toBe(201); const session = await response.json(), storeId = session.stores[0].id;
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const category = await request.post(`${API_URL}/categories`, { headers, data: { name: "Contention" } });
    const productResponse = await request.post(`${API_URL}/products`, { headers, data: { sku: "BUSY", name: "Contention item", categoryId: (await category.json()).id, costPrice: 2, sellPrice: 5, exemptionCode: "M10" } });
    expect(productResponse.status()).toBe(201); const product = await productResponse.json();
    expect((await request.put(`${API_URL}/stores/${storeId}/inventory/${product.id}`, { headers, data: { quantity: 10 } })).status()).toBe(200);
    let app: ElectronApplication | undefined;
    const browser = mode === "browser" ? await chromium.launch({ channel: "msedge", headless: true }) : undefined;
    let page: Page;
    if (browser) page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    else { ({ app, page } = await launch(tempUserData())); await connect(page, API_URL); }
    try {
      const origin = app ? "app://pos" : process.env.POS_TEST_WEB_URL!;
      await page.goto(`${origin}/login`);
      await page.evaluate((s) => {
        localStorage.setItem("pos-auth", JSON.stringify({ state: { accessToken: s.accessToken, user: s.user, stores: s.stores, business: s.business, currentStoreId: s.stores[0].id, offline: false, permissions: null }, version: 0 }));
        localStorage.setItem("pos-device-role", JSON.stringify({ state: { role: "TILL" }, version: 0 }));
        localStorage.setItem("pos-language", "en");
      }, session);
      if (app) { await page.reload(); await registerTill(page, "Contention till"); }
      const levels = page.waitForResponse((r) => r.url().includes("/inventory/levels") && r.status() === 200);
      await page.goto(`${origin}/pos`); await levels;
      await page.getByLabel("Opening float").fill("0"); await page.getByRole("button", { name: "Open the till", exact: true }).click();
      await page.getByRole("button", { name: "Contention", exact: true }).click();
      await page.locator("div.grid > button.text-left").filter({ hasText: product.name }).click();
      const charge = page.getByRole("button", { name: /^Charge/ });
      let ready!: () => void, release!: () => void;
      const locked = new Promise<void>((r) => { ready = r; }), gate = new Promise<void>((r) => { release = r; });
      const holding = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM inventory_items WHERE "storeId"=${storeId} AND "productId"=${product.id} FOR UPDATE`;
        ready(); await gate;
      }, { timeout: 20000 });
      await locked;
      try {
        const rejected = page.waitForResponse((r) => r.url().endsWith("/sales") && r.request().method() === "POST");
        await charge.click(); const result = await rejected;
        expect(result.status()).toBe(409); expect(await result.json()).toMatchObject({ code: "STOCK_BUSY" });
        await expect(page.getByText("Stock is busy. Please try again.", { exact: true })).toBeVisible();
        await expect(page.getByLabel(`Quantity of ${product.name}`)).toHaveValue("1"); await expect(charge).toBeEnabled();
        await expect(page.getByTestId("sync-status")).toBeHidden(); expect((await outbox(page)).filter((e) => e.kind === "sale")).toHaveLength(0);
        expect(await db.sale.count({ where: { storeId } })).toBe(0);
        expect(await db.fiscalDocument.count({ where: { storeId } })).toBe(0);
      } finally { release(); await holding; }
      const accepted = page.waitForResponse((r) => r.url().endsWith("/sales") && r.request().method() === "POST");
      await charge.click(); const result = await accepted; expect(result.status()).toBe(201);
      await expect(page.getByRole("dialog").filter({ hasText: "Sale complete" })).toContainText(/FR .*\/1/);
      const sale = await result.json(), payload = result.request().postDataJSON();
      const replay = await request.post(`${API_URL}/sales`, { headers, data: payload });
      expect(replay.status()).toBe(201); expect((await replay.json()).id).toBe(sale.id);
      expect((await outbox(page)).filter((e) => e.kind === "sale")).toHaveLength(0);
      expect(await db.sale.count({ where: { storeId } })).toBe(1);
      expect(await db.fiscalDocument.count({ where: { storeId } })).toBe(1);
      expect(await db.stockMovement.count({ where: { storeId, type: "SALE" } })).toBe(1);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: product.id } } })).quantity.toNumber()).toBe(9);
    } finally { await browser?.close(); await app?.close(); }
  });
}
