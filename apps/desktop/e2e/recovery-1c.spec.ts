import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, tempUserData } from "./helpers";

// Explicit opt-in: all data belongs to a fresh business on the isolated test API.
test.skip(process.env.POS_RECOVERY_UI_TESTS !== "1", "Requires an isolated recovery API and POS_RECOVERY_UI_TESTS=1");

for (const mode of ["browser", "electron"] as const) {
  test(`${mode}: bulk stock count preview and Save all at touchscreen sizes`, async ({ request }) => {
    expect(new URL(API_URL).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    const registration = await request.post(`${API_URL}/auth/register`, { data: {
      businessName: `Count UI ${mode}`, storeName: "Count UI Store", firstName: "Count", lastName: "Owner",
      email: `count-ui-${mode}-${Date.now()}@e2e.test`, password: "CountUiTest123!", language: "en",
    } });
    expect(registration.status()).toBe(201);
    const session = await registration.json();
    session.user.language = "pt-PT";
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const storeId = session.stores[0].id;
    for (const [sku, name] of [["COUNT-A", "Count tea"], ["COUNT-B", "Count coffee"]]) {
      const response = await request.post(`${API_URL}/products`, { headers, data: { sku, name, costPrice: 2, sellPrice: 4, exemptionCode: "M10" } });
      expect(response.status()).toBe(201);
    }
    let app: ElectronApplication | undefined;
    const browser = mode === "browser" ? await chromium.launch({ channel: "msedge", headless: true }) : undefined;
    let page: Page;
    if (browser) page = await browser.newPage();
    else { ({ app, page } = await launch(tempUserData())); await connect(page, API_URL); }
    try {
      const origin = mode === "electron" ? "app://pos" : (process.env.POS_TEST_WEB_URL ?? "http://localhost:55441");
      await page.goto(`${origin}/login`);
      await page.evaluate((session) => {
        localStorage.setItem("pos-auth", JSON.stringify({ state: { accessToken: session.accessToken, user: session.user, stores: session.stores, business: session.business, currentStoreId: session.stores[0].id, offline: false, permissions: null }, version: 0 }));
        localStorage.setItem("pos-language", "pt-PT");
      }, session);
      await page.goto(`${origin}/inventory`);
      for (const [width, height] of [[1024, 768], [1366, 768]]) {
        if (app) await app.evaluate(({ BrowserWindow }, { width, height }) => {
          const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(800, 600); win.setContentSize(width, height);
        }, { width, height });
        else await page.setViewportSize({ width, height });
        const inputs = page.locator('main input[type="number"]');
        await expect(inputs).toHaveCount(2);
        await inputs.nth(0).fill(width === 1024 ? "3" : "4"); await inputs.nth(1).fill(width === 1024 ? "7" : "8");
        await page.getByRole("button", { name: /Guardar tudo/ }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText("Count coffee"); await expect(dialog).toContainText("Count tea");
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await dialog.getByRole("button", { name: "Aplicar contagem" }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByRole("button", { name: /Guardar tudo/ })).toBeDisabled();
      }
      const upload = page.locator('input[type="file"]');
      await upload.setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("SKU,Quantity\nCOUNT-A,-1") });
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: "Aplicar contagem" })).toBeDisabled();
      await expect(dialog.getByRole("alert")).toBeVisible();
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await upload.setInputFiles({ name: "count.csv", mimeType: "text/csv", buffer: Buffer.from("SKU,Quantity\nCOUNT-A,2\nCOUNT-B,9") });
      await expect(dialog.getByRole("button", { name: "Aplicar contagem" })).toBeEnabled();
      await dialog.getByRole("button", { name: "Aplicar contagem" }).click();
      await expect(dialog).toBeHidden();
      const inventory = await request.get(`${API_URL}/stores/${storeId}/inventory`, { headers });
      const items = await inventory.json();
      expect(items.map((i: { product: { sku: string }; quantity: string }) => [i.product.sku, i.quantity]).sort()).toEqual([["COUNT-A", "2"], ["COUNT-B", "9"]]);
    } finally { await app?.close(); await browser?.close(); }
  });
}
