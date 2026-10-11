import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  FakePrinter,
  launch,
  login,
  openPosWithProducts,
  outbox,
  restock,
  serverSales,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * Cancelling a sale from Recent sales (docs/plans/TILL_ESSENTIALS.md, part
 * 1), online and offline. The drawer is a fake network printer, so the kick
 * that hands back the cash can be checked.
 */
const KICK = "1b 40 1b 70 00 32 64";

interface SaleRow {
  id: string;
  clientId: string | null;
  status: string;
  voidReason: string | null;
  createdOffline: boolean;
}

function salesWithStatus(page: Page) {
  return serverSales(page) as unknown as Promise<SaleRow[]>;
}

test.describe.serial("Till: cancel a sale", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const printer = new FakePrinter();
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  async function cashSale() {
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }

  async function cancelLatest(reason: string) {
    await page.getByRole("button", { name: "Recent sales" }).click();
    const latest = page.getByTestId("recent-sale").first();
    await latest.getByRole("button", { name: "Cancel sale" }).click();
    await page.getByLabel(reason).check();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel sale" }).click();
  }

  test.beforeAll(async () => {
    await proxy.up();
    await printer.start();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);

    await page.goto("app://pos/device");
    await page.getByRole("combobox", { name: "Drawer connection" }).click();
    await page.getByRole("option", { name: "Network printer (IP address)" }).click();
    await page.getByLabel("Printer IP address").fill("127.0.0.1");
    await page.getByLabel("Printer IP address").press("Enter");
    await page.getByLabel("Port", { exact: true }).fill(String(printer.port));
    await page.getByLabel("Port", { exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "Test drawer" })).toBeVisible();
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
    await printer.stop();
  });

  test("online: cancel the last sale, hand back the cash, print the slip", async () => {
    await openPosWithProducts(page);
    await cashSale();
    await expect.poll(() => printer.jobs.length).toBe(1);
    const saleId = (await salesWithStatus(page))[0].id;

    await cancelLatest("Customer changed their mind");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Sale cancelled");
    await expect(dialog).toContainText(/Hand back .+ in cash/);
    await expect(dialog).toContainText("*** CANCELLED ***");
    // The drawer opens to hand the money back.
    await expect.poll(() => printer.jobs.length).toBe(2);
    expect(printer.jobs[1]).toBe(KICK);

    const sale = (await salesWithStatus(page)).find((s) => s.id === saleId)!;
    expect(sale).toMatchObject({ status: "VOIDED", voidReason: "CUSTOMER_CHANGED_MIND" });

    await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    const row = page.getByTestId("recent-sale").first();
    await expect(row).toContainText("Cancelled");
    await expect(row.getByRole("button", { name: "Cancel sale" })).toHaveCount(0);
  });

  test("reprint marks the receipt as a copy", async () => {
    await page.getByTestId("recent-sale").first().getByRole("button", { name: "Reprint receipt" }).click();
    await expect(page.getByRole("dialog").last()).toContainText("COPY");
    await page.keyboard.press("Escape");
    // Back to the list once the receipt window has gone.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toContainText("Recent sales");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("offline: a sale that hasn't uploaded can be cancelled, and both sync in order", async () => {
    await proxy.down();
    await cashSale();
    await page.getByRole("button", { name: "Recent sales" }).click();
    await expect(page.getByTestId("recent-sale").first()).toContainText("Waiting to upload");
    await page.keyboard.press("Escape");

    await cancelLatest("Wrong items or price");
    await expect(page.getByRole("dialog")).toContainText("It will sync when the till is back online");
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(page.getByTestId("recent-sale").first()).toContainText("Cancelled");
    await page.keyboard.press("Escape");

    await proxy.up();
    await expect
      .poll(async () => (await outbox(page)).filter((e) => e.state !== "synced").length, { timeout: 70_000 })
      .toBe(0);
    // The offline sale is the newest one, already cancelled.
    const [latest] = await salesWithStatus(page);
    expect(latest).toMatchObject({ createdOffline: true, status: "VOIDED", voidReason: "WRONG_ITEMS" });
  });

  test("a cashier without the permission can't cancel", async () => {
    await page.goto("app://pos/pos");
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, "cashier@demo-store.test", "CashierPass123!");
    await openPosWithProducts(page);
    await page.getByRole("button", { name: "Recent sales" }).click();
    await expect(page.getByTestId("recent-sale").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel sale" })).toHaveCount(0);
  });
});
