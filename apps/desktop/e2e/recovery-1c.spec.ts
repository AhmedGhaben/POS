import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, tempUserData } from "./helpers";
import { randomUUID } from "node:crypto";
import { buildXlsx } from "../../api/src/common/xlsx";

// Explicit opt-in: all data belongs to a fresh business on the isolated test API.
test.skip(process.env.POS_RECOVERY_UI_TESTS !== "1", "Requires an isolated recovery API and POS_RECOVERY_UI_TESTS=1");

for (const mode of ["browser", "electron"] as const) {
  test(`${mode}: stock counts and full back-office shift report at touchscreen sizes`, async ({ request }) => {
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
      for (const quantity of [-1, 3]) {
        await upload.setInputFiles({ name: "count.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buildXlsx([{ name: "Count", header: ["SKU", "Quantity"], rows: [["COUNT-A", quantity], ["COUNT-B", 10]] }]) });
        if (quantity < 0) { await expect(dialog.getByRole("button", { name: "Aplicar contagem" })).toBeDisabled(); await expect(dialog.getByRole("alert")).toBeVisible(); }
        else { await expect(dialog.getByRole("button", { name: "Aplicar contagem" })).toBeEnabled(); await expect(dialog).toContainText("Count tea"); }
        await dialog.getByRole("button", { name: "Cancelar" }).click();
      }
      await upload.setInputFiles({ name: "count.csv", mimeType: "text/csv", buffer: Buffer.from("SKU,Quantity\nCOUNT-A,2\nCOUNT-B,9") });
      await expect(dialog.getByRole("button", { name: "Aplicar contagem" })).toBeEnabled();
      await dialog.getByRole("button", { name: "Aplicar contagem" }).click();
      await expect(dialog).toBeHidden();
      const inventory = await request.get(`${API_URL}/stores/${storeId}/inventory`, { headers });
      const items = await inventory.json();
      expect(items.map((i: { product: { sku: string }; quantity: string }) => [i.product.sku, i.quantity]).sort()).toEqual([["COUNT-A", "2"], ["COUNT-B", "9"]]);

      const shiftClientId = randomUUID();
      const opened = await request.post(`${API_URL}/shifts/open`, { headers, data: { storeId, clientId: shiftClientId, openingFloat: 10 } });
      expect(opened.status()).toBe(200);
      for (const method of ["CASH", "CARD"]) {
        const sold = await request.post(`${API_URL}/sales`, { headers, data: { storeId, shiftClientId, lineItems: [{ productId: items[0].productId, quantity: 1 }], payments: [{ method, amount: 4 }] } });
        expect(sold.status()).toBe(201);
      }
      const closed = await request.post(`${API_URL}/shifts/close`, { headers, data: { storeId, shiftClientId, countedCash: 15, note: "UI count note" } });
      expect(closed.status()).toBe(200);
      const report = await closed.json();
      expect(report.summary.sales).toHaveLength(2);
      const backoffice = await request.get(`${API_URL}/shifts/${report.id}`, { headers });
      expect((await backoffice.json()).summary).toEqual(report.summary);
      await page.goto(`${origin}/shifts`);
      await page.locator("main tbody tr").first().click();
      const shiftDialog = page.getByRole("dialog");
      await expect(shiftDialog).toContainText("UI count note");
      await expect(shiftDialog).toContainText("Count coffee");
      await expect(shiftDialog).toContainText("Multicaixa");
      await expect(shiftDialog).toContainText("Sobra 1,00");
      for (const sale of report.summary.sales) await expect(shiftDialog).toContainText(sale.documentNo ?? sale.receiptNumber);
      const print = page.locator("#print-root .receipt-slip");
      expect(await print.textContent()).toEqual(await shiftDialog.locator(".receipt-slip").textContent());
      for (const sale of report.summary.sales) {
        if (sale.documentNo) await expect(print).not.toContainText(sale.receiptNumber);
      }
      await page.keyboard.press("Escape");
      await page.goto(`${origin}/sales`);
      const salesTable = page.locator("main tbody");
      for (const sale of report.summary.sales) {
        await expect(salesTable).toContainText(sale.documentNo);
        await expect(salesTable).not.toContainText(sale.receiptNumber);
      }
      // Capture the actual CSV Blob without opening an OS save dialog in Electron.
      await page.evaluate(() => {
        const original = URL.createObjectURL;
        URL.createObjectURL = (blob) => {
          if (blob instanceof Blob && blob.type.startsWith("text/csv")) void blob.text().then((text) => { (window as unknown as { recoveryCsv: string }).recoveryCsv = text; });
          return original(blob);
        };
        document.addEventListener("click", (event) => {
          const anchor = (event.target as HTMLElement).closest("a[download]");
          if (anchor) event.preventDefault();
        }, true);
      });
      await page.getByRole("button", { name: /Exportar CSV/ }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { recoveryCsv?: string }).recoveryCsv ?? "")).toContain(report.summary.sales[0].documentNo);
      const csv = await page.evaluate(() => (window as unknown as { recoveryCsv: string }).recoveryCsv);
      for (const sale of report.summary.sales) { expect(csv).toContain(sale.documentNo); expect(csv).not.toContain(sale.receiptNumber); }
    } finally { await app?.close(); await browser?.close(); }
  });
}
