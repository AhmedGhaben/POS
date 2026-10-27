import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, registerTill, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * Touch mode (tester #24): most tills are small touchscreens with no
 * keyboard, and Windows shows no keypad for the app. With touch mode on
 * (This device), number fields open an on-screen keypad: the opening float,
 * a line's quantity and the cash handed over are all typed by tapping.
 */
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

async function closeOpenShift(page: Page) {
  const { shift } = await api<{ shift: { clientId: string } | null }>(page, `/shifts/current?storeId=${await storeId(page)}`);
  if (shift) await api(page, "/shifts/close", { method: "POST", body: { storeId: await storeId(page), shiftClientId: shift.clientId, countedCash: 0 } });
}

test.describe.serial("Till: touch mode", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  const keypad = () => page.getByTestId("numeric-keypad");
  const tap = async (...keys: string[]) => {
    for (const key of keys) await keypad().getByRole("button", { name: key, exact: true }).click();
  };

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    await registerTill(page, "Touch Till");
    await closeOpenShift(page);
  });

  test.afterAll(async () => {
    await closeOpenShift(page).catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("off until it's turned on in This device", async () => {
    await page.goto("app://pos/device");
    await expect(page.locator("html")).not.toHaveClass(/\btouch\b/);
    await page.getByLabel("Use touch mode on this device").check();
    await expect(page.locator("html")).toHaveClass(/\btouch\b/);
  });

  test("the opening float on the keypad: 5, 00, OK opens the till", async () => {
    await openPosWithProducts(page, { openShift: false });
    const float = page.getByLabel("Opening float");
    await expect(keypad()).toBeVisible();
    await tap("5", "00");
    await expect(float).toHaveValue("500");
    await tap("OK");
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeVisible();
  });

  test("a quantity and the cash handed over, by tapping", async () => {
    await page.locator("div.grid > button.text-left").first().click();
    const quantity = page.getByLabel(/^Quantity of /).first();
    await quantity.click();
    // The first key replaces what was there, like typing over a selected field.
    await tap("3");
    await expect(quantity).toHaveValue("3");
    await tap("OK");
    await expect(keypad()).toHaveCount(0);
    await expect(quantity).toHaveValue("3");

    const tendered = page.getByLabel("Tendered amount (optional)");
    await tendered.click();
    await tap("1", "00", "00", "00", "Delete the last digit");
    await expect(tendered).toHaveValue("100000");
    await tap("OK");
    await expect(page.getByText(/^Change due:/)).toBeVisible();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    await page.keyboard.press("Escape");
  });

  test("a keyboard still works in touch mode", async () => {
    await page.locator("div.grid > button.text-left").first().click();
    const tendered = page.getByLabel("Tendered amount (optional)");
    await tendered.fill("250000,5");
    await expect(tendered).toHaveValue("250000,5");
    await expect(page.getByText(/^Change due:/)).toBeVisible();
  });
});
