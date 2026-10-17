import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  launch,
  login,
  openPosWithProducts,
  outbox,
  restock,
  serverSales,
  SwitchableProxy,
  tempUserData,
  logOut,
  registerTill,
} from "./helpers";

/**
 * Discounts at the till (docs/plans/TILL_ESSENTIALS.md, part 2): a line
 * discount and a whole-sale discount, the receipt shows them, and the server
 * records exactly what the till charged, online and offline.
 */
interface SaleRow {
  id: string;
  createdOffline: boolean;
  total: string;
  discountTotal: string;
  saleDiscountAmount: string;
}

const sales = (page: Page) => serverSales(page) as unknown as Promise<SaleRow[]>;

/** The total on the Charge button, as a number. */
async function chargeAmount(page: Page) {
  const text = (await page.getByRole("button", { name: /^Charge/ }).textContent()) ?? "";
  // "1 234,56 Kz" (Angola) or "$1,234.56": the last separator is the decimal one.
  const digits = text.replace(/[^\d.,]/g, "");
  const decimal = Math.max(digits.lastIndexOf(","), digits.lastIndexOf("."));
  return decimal < 0 ? Number(digits) : Number(`${digits.slice(0, decimal).replace(/[.,]/g, "")}.${digits.slice(decimal + 1)}`);
}

test.describe.serial("Till: discounts", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  async function discountedCart() {
    const first = page.locator("div.grid > button.text-left").first();
    await first.click();
    await first.click();
    await page.getByRole("button", { name: /^Discount on / }).first().click();
    await page.getByRole("radio", { name: "Percentage" }).click();
    await page.getByLabel("Percentage off").fill("10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/10% off \(-/)).toBeVisible();

    await page.getByRole("button", { name: "Discount on the whole sale" }).click();
    await page.getByRole("radio", { name: "Amount" }).click();
    await page.getByLabel("Amount off").fill("1");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Sale discount", { exact: true })).toBeVisible();
  }

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    // Selling offline needs the till's signing key (Angola).
    await registerTill(page, "Discount Till");
    await openPosWithProducts(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("online: line and sale discounts reach the receipt and the server", async () => {
    await discountedCart();
    const shown = await chargeAmount(page);
    await page.getByRole("button", { name: /^Charge/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Sale complete");
    // The receipt is in the store's document language (AO → pt-AO), the screens in English.
    await expect(dialog).toContainText("Desconto na venda");
    await expect(dialog).toContainText(/Poupou/);
    await page.keyboard.press("Escape");

    const [latest] = await sales(page);
    expect(Number(latest.total)).toBeCloseTo(shown, 2);
    expect(Number(latest.saleDiscountAmount)).toBe(1);
    expect(Number(latest.discountTotal)).toBeGreaterThan(1);
  });

  test("the cart starts again without discounts", async () => {
    await page.locator("div.grid > button.text-left").first().click();
    await expect(page.getByText(/% off \(-/)).toHaveCount(0);
    await page.getByRole("button", { name: "Clear cart" }).click();
  });

  test("offline: the server records the same total the till charged", async () => {
    await proxy.down();
    await discountedCart();
    const shown = await chargeAmount(page);
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Saved offline");
    await page.keyboard.press("Escape");

    await proxy.up();
    await expect
      .poll(async () => (await outbox(page)).filter((e) => e.state !== "synced").length, { timeout: 70_000 })
      .toBe(0);
    const [latest] = await sales(page);
    expect(latest.createdOffline).toBe(true);
    expect(Number(latest.total)).toBeCloseTo(shown, 2);
  });

  test("a cashier without the permission needs a manager's approval for a discount", async () => {
    await logOut(page);
    await login(page, "cashier@demo-store.test", "CashierPass123!");
    await openPosWithProducts(page);
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("button", { name: /^Discount on / }).first().click();
    await page.getByLabel("Percentage off").fill("5");
    await expect(page.getByText("A manager needs to approve this discount.")).toBeVisible();
    await page.getByRole("button", { name: "Ask a manager" }).click();
    const approval = page.getByRole("dialog", { name: "Manager approval" });
    await expect(approval).toBeVisible();
    // Without the approval, no discount.
    await approval.getByRole("button", { name: "Cancel" }).click();
    await expect(approval).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/off \(-/)).toHaveCount(0);
    await page.getByRole("button", { name: "Clear cart" }).click();
    await logOut(page);
  });
});
