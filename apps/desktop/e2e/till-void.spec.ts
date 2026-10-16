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
  sellFirstProduct,
  serverSales,
  SwitchableProxy,
  tempUserData,
  logOut,
  registerTill,
} from "./helpers";

/**
 * Cancelling a sale from Recent sales (docs/plans/TILL_ESSENTIALS.md, part
 * 1), online and offline. The drawer is a fake network printer, so the kick
 * that hands back the cash can be checked.
 */
const KICK = "1b 40 1b 70 00 32 64";
/** The demo owner's till PIN in the dev database (seeded for the PIN tests). */
const OWNER_PIN = "8642";

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

  async function cancelLatest(reason: string | RegExp) {
    await page.getByRole("button", { name: "Recent sales" }).click();
    const latest = page.getByTestId("recent-sale").first();
    await latest.getByRole("button", { name: "Cancel sale" }).click();
    await page.getByRole("radio", { name: reason }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel sale" }).click();
  }

  test.beforeAll(async () => {
    await proxy.up();
    await printer.start();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    // A shift a previous run left open would skip the float's drawer kick this test counts from.
    await page.evaluate(async () => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const headers = { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" };
      const current = await (await fetch(`/api/shifts/current?storeId=${auth.currentStoreId}`, { headers })).json();
      if (current?.shift?.status === "OPEN") {
        await fetch("/api/shifts/close", {
          method: "POST",
          headers,
          body: JSON.stringify({ storeId: auth.currentStoreId, shiftClientId: current.shift.clientId, countedCash: 0 }),
        });
      }
    });

    // Selling offline needs the till's signing key (Angola).
    await registerTill(page, "Void Till");
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
    // Opening the till kicks the drawer for the float: count from here.
    await expect.poll(() => printer.jobs.length).toBeGreaterThanOrEqual(1);
    printer.jobs.splice(0);
    await cashSale();
    await expect.poll(() => printer.jobs.length).toBe(1);
    const saleId = (await salesWithStatus(page))[0].id;

    await cancelLatest(/^N: the document never reached the customer/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Sale cancelled");
    await expect(dialog).toContainText(/Hand back .+ in cash/);
    await expect(dialog).toContainText("*** CANCELLED ***");
    // The drawer opens to hand the money back.
    await expect.poll(() => printer.jobs.length).toBe(2);
    expect(printer.jobs[1]).toBe(KICK);

    const sale = (await salesWithStatus(page)).find((s) => s.id === saleId)!;
    expect(sale).toMatchObject({ status: "VOIDED", voidReason: "ANNUL_N" });

    await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    const row = page.getByTestId("recent-sale").first();
    await expect(row).toContainText("Cancelled");
    await expect(row.getByRole("button", { name: "Cancel sale" })).toHaveCount(0);
  });

  test("reprint marks the receipt as a copy", async () => {
    await page.getByTestId("recent-sale").first().getByRole("button", { name: "Reprint receipt" }).click();
    await expect(page.getByRole("dialog").last()).toContainText("2ª Via"); // phase 5: a reprint of a fiscal document
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

    await cancelLatest(/^I: the customer was wrongly identified/);
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
    expect(latest).toMatchObject({ createdOffline: true, status: "VOIDED", voidReason: "ANNUL_I" });
  });

  test("a cashier without the permission cancels with a manager's approval (PIN)", async () => {
    await page.goto("app://pos/pos");
    await logOut(page);
    await login(page, "cashier@demo-store.test", "CashierPass123!");
    await openPosWithProducts(page);
    await sellFirstProduct(page);

    await cancelLatest(/^I: the customer was wrongly identified/);
    const approval = page.getByRole("dialog", { name: "Manager approval" });
    await expect(approval).toContainText("Cancel sale");
    // Cancelling the approval leaves the sale alone.
    await approval.getByRole("button", { name: "Cancel" }).click();
    await expect(approval).toBeHidden();
    expect((await salesWithStatus(page))[0].status).toBe("COMPLETED");

    await page.getByRole("dialog").getByRole("button", { name: "Cancel sale" }).click();
    await approval.getByRole("button", { name: "Ada Owner" }).click();
    for (const digit of "0000") await page.keyboard.press(digit);
    await page.keyboard.press("Enter");
    await expect(approval).toContainText("Wrong PIN");
    for (const digit of OWNER_PIN) await page.keyboard.press(digit);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("Sale cancelled");
    expect((await salesWithStatus(page))[0]).toMatchObject({ status: "VOIDED", voidReason: "ANNUL_I" });
    // Close the slip and Recent sales, then sign out (closing the cashier's shift).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog").filter({ hasText: "Sale cancelled" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await logOut(page);
  });
});
