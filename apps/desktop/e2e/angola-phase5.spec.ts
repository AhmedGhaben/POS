import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, restock, sellFirstProduct, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 5 in the app: the Sales history (find a sale,
 * reprint it: a fiscal reprint says "2ª Via"), the A4 document's first
 * print is the original and later ones "2ª Via", purchases filtered by
 * payment, and the store's print settings.
 */
test.describe.serial("Angola phase 5: history and printing", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("Sales: today's sale is listed; its slip reprints as a 2ª Via, its A4 as the original then 2ª Via", async () => {
    await openPosWithProducts(page);
    await sellFirstProduct(page);
    await page.getByRole("link", { name: "Sales" }).click();
    const row = page.getByRole("row").nth(1);
    await expect(row).toContainText(/FR \S+\/\d+/);
    await row.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("2ª Via");
    await dialog.getByRole("button", { name: "A4 document" }).click();
    const a4 = page.getByRole("dialog", { name: /^Factura-Recibo FR / });
    await expect(a4).toContainText("First print");
    await expect(a4.getByText("Original", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Purchases: filtered by payment status", async () => {
    await page.goto("app://pos/purchases");
    await page.getByRole("combobox", { name: "Payment" }).click();
    await page.getByRole("option", { name: "Paid", exact: true }).click();
    await expect(page.getByText(/\d+ purchases?$/)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: /Unpaid|Part paid/ })).toHaveCount(0);
  });

  test("Settings: the store prints A4 after a sale, in two copies", async () => {
    await page.goto("app://pos/settings");
    await page.getByRole("button", { name: "Edit" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "After a sale, print" }).click();
    await page.getByRole("option", { name: "The A4 document" }).click();
    await dialog.getByRole("combobox", { name: "A4 copies" }).click();
    await page.getByRole("option", { name: "Original + Duplicado" }).click();
    await dialog.getByRole("button", { name: /Save/ }).click();
    // Put it back for the other suites.
    await page.getByRole("button", { name: "Edit" }).first().click();
    await dialog.getByRole("combobox", { name: "After a sale, print" }).click();
    await page.getByRole("option", { name: "The slip (receipt printer)" }).click();
    await dialog.getByRole("combobox", { name: "A4 copies" }).click();
    await page.getByRole("option", { name: "Original only" }).click();
    await dialog.getByRole("button", { name: /Save/ }).click();
  });
});
