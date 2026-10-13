import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  launch,
  login,
  openPosWithProducts,
  outbox,
  restock,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * Shifts at the till (docs/plans/TILL_ESSENTIALS.md, part 4): open with a
 * float, sell (one sale offline), take cash out, close with a blind count,
 * and the server's report agrees with the till's. Shifts are switched on for
 * the demo business here and off again afterwards.
 */
interface ShiftRow {
  status: string;
  clientId: string;
  openingFloat: string;
  countedCash: string | null;
  expectedCash: string | null;
  tillExpectedCash: string | null;
  difference: string | null;
  summary?: { salesCount: number; cashOut: string; byMethod: Record<string, string> };
}

function api<T>(page: Page, path: string, init: { method?: string; body?: unknown } = {}) {
  return page.evaluate(
    async ({ path, init }) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const res = await fetch(`/api${path}`, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      if (!res.ok) throw new Error(`${path} ${res.status}`);
      return res.json();
    },
    { path, init },
  ) as Promise<T>;
}

const storeId = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.currentStoreId as string);

test.describe.serial("Till: shifts", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  async function sale(method: "Cash" | "Card", offline = false) {
    await page.locator("div.grid > button.text-left").first().click();
    if (method === "Card") {
      await page.getByRole("combobox").filter({ hasText: "Cash" }).click();
      await page.getByRole("option", { name: "Card", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText(offline ? "Saved offline" : "Sale complete");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    // Close any shift a previous run left open in a browser for this owner.
    const { shift: open } = await api<{ shift: ShiftRow | null }>(page, `/shifts/current?storeId=${await storeId(page)}`);
    if (open) await api(page, "/shifts/close", { method: "POST", body: { storeId: await storeId(page), shiftClientId: open.clientId, countedCash: 0 } });
  });

  test.afterAll(async () => {
    await proxy.up().catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("no selling until the till is opened with a float", async () => {
    await page.goto("app://pos/pos");
    await page.reload();
    await openPosWithProducts(page, { openShift: false });
    await expect(page.getByRole("button", { name: /^Charge/ })).toHaveCount(0);
    await page.getByLabel("Opening float").fill("100");
    await page.getByRole("button", { name: "Open the till" }).click();
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeVisible();
  });

  test("sell, take cash out, and sell once more while offline", async () => {
    await sale("Cash");
    await sale("Card");
    await page.getByRole("button", { name: "Cash in / out" }).click();
    await page.getByLabel("Amount").fill("20");
    await page.getByLabel("Cash pickup (to the safe)").check();
    await page.getByRole("button", { name: "Take cash out" }).click();
    await expect(page.getByText(/taken out/).first()).toBeVisible();

    await proxy.down();
    await sale("Cash", true);
    await proxy.up();
    await expect
      .poll(async () => (await outbox(page)).filter((e) => e.state !== "synced").length, { timeout: 70_000 })
      .toBe(0);
  });

  test("closing: a blind count, then the difference and the report", async () => {
    await page.getByRole("button", { name: "Close the till" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).not.toContainText("Expected");
    await page.getByLabel("Cash counted").fill("0");
    await dialog.getByRole("button", { name: "Close the till" }).click();
    await expect(dialog).toContainText("Till closed");
    await expect(dialog).toContainText(/short/);
    await expect(dialog).toContainText("END OF SHIFT");
    await expect(dialog).toContainText("Expected cash");

    const list = await api<{ items: ShiftRow[] }>(page, `/shifts?storeId=${await storeId(page)}&pageSize=1`);
    const shift = list.items[0];
    expect(shift.status).toBe("CLOSED");
    expect(shift.countedCash).toBe("0");
    // The till and the server agree: every sale (the offline one too) uploaded before the close.
    expect(shift.tillExpectedCash).toBe(shift.expectedCash);
    expect(Number(shift.difference)).toBeCloseTo(-Number(shift.expectedCash), 2);
    const report = await api<ShiftRow>(page, `/shifts/client/${shift.clientId}?storeId=${await storeId(page)}`);
    expect(report.summary).toMatchObject({ salesCount: 3, cashOut: "20.00" });

    // The shift is over, so the cashier is signed out.
    await dialog.getByRole("button", { name: "Done (sign out)" }).click();
    await page.waitForURL(/\/login/);
  });

  test("the next shift: Log out closes it first, counted by note and coin", async () => {
    await login(page);
    await openPosWithProducts(page);
    await sale("Cash");
    await page.getByRole("button", { name: "Log out" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Close the till");
    await dialog.getByLabel("Count by note and coin").check();
    await dialog.getByLabel(/Number of .*5,000|Number of .*5 000|Number of .*5000/).fill("1");
    await expect(dialog.getByTestId("count-total")).toContainText("5");
    await dialog.getByRole("button", { name: "Close the till" }).click();
    await expect(dialog).toContainText("Till closed");
    const list = await api<{ items: (ShiftRow & { countedDenominations: Record<string, number> })[] }>(
      page,
      `/shifts?storeId=${await storeId(page)}&pageSize=1`,
    );
    expect(list.items[0]).toMatchObject({ status: "CLOSED", countedCash: "5000", countedDenominations: { "5000": 1 } });
    await dialog.getByRole("button", { name: "Done (sign out)" }).click();
    await page.waitForURL(/\/login/);
  });

  test("the Shifts page lists it with the difference", async () => {
    await login(page);
    await page.goto("app://pos/shifts");
    const row = page.getByRole("row").nth(1);
    await expect(row).toContainText("Ada Owner");
    await row.click();
    await expect(page.getByRole("dialog")).toContainText("END OF SHIFT");
  });
});
