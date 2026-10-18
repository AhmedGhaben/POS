import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, logOut, openPosWithProducts, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/DECISIONS.md, "Four fixes from testing": the cart survives going to
 * the back office and Settings and back, and a restart; it goes when the
 * sale completes; logging out with a sale asks, and the next person
 * doesn't get it. The screens are in English, the store is in Angola, so
 * documents are in Portuguese with DD/MM/YYYY dates.
 */
test.describe.serial("POS cart kept, Back to POS, documents in the store's language", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  const charge = () => page.getByRole("button", { name: /^Charge/ });
  const tendered = () => page.getByPlaceholder("Tendered amount (optional)");
  const email = () => page.getByPlaceholder("Email receipt (optional)");
  const products = () => page.locator("div.grid > button.text-left");

  /** What the sale looks like: the total on Charge, the cash typed, the email. */
  async function snapshot() {
    await charge().waitFor();
    return { charge: await charge().textContent(), tendered: await tendered().inputValue(), email: await email().inputValue() };
  }

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

  let before: Awaited<ReturnType<typeof snapshot>>;

  test("a sale in progress: items, a quantity, cash typed and an email", async () => {
    await openPosWithProducts(page);
    await products().nth(0).click();
    await products().nth(0).click();
    await products().nth(1).click();
    await email().fill("cliente@example.com");
    await tendered().fill("99999");
    before = await snapshot();
    expect(before.tendered).toBe("99999");
  });

  test("to the dashboard and back with Back to POS: nothing lost", async () => {
    await page.getByRole("link", { name: "Back to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const back = page.getByRole("link", { name: /^Back to POS/ });
    await expect(back).toContainText("2"); // two different products in the cart
    await back.click();
    await expect(page).toHaveURL(/\/pos$/);
    expect(await snapshot()).toEqual(before);
  });

  test("to Settings, This device and Products, and back: nothing lost", async () => {
    await page.goto("app://pos/settings");
    await page.getByRole("link", { name: /^Back to POS/ }).click();
    expect(await snapshot()).toEqual(before);

    await page.getByRole("link", { name: "This device" }).click();
    await expect(page).toHaveURL(/\/device$/);
    await page.getByRole("link", { name: "Back to POS" }).click();
    expect(await snapshot()).toEqual(before);

    await page.goto("app://pos/products");
    await page.getByRole("link", { name: /^Back to POS/ }).click();
    expect(await snapshot()).toEqual(before);
  });

  test("after closing and reopening the app: nothing lost", async () => {
    await app.close();
    ({ app, page } = await launch(userData));
    await page.waitForURL(/^app:\/\/pos\/(login|pos|dashboard|$)/);
    if (page.url().includes("/login")) await login(page);
    await page.goto("app://pos/pos");
    expect(await snapshot()).toEqual(before);
  });

  test("logging out with the sale asks; Hold order parks it, and the cashier signing in next doesn't get it", async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    const ask = page.getByRole("dialog").filter({ hasText: "There's a sale in the cart" });
    await expect(ask.getByRole("button", { name: "Hold order" })).toBeVisible();
    await expect(ask.getByRole("button", { name: "Cancel the sale" })).toBeVisible();
    await ask.getByRole("button", { name: "Hold order" }).click();
    // Then the usual way out: the owner's shift is closed first. Nothing was
    // sold in it (the sale was held), so it closes in one click at the float.
    const closing = page.getByRole("dialog").filter({ hasText: "Close the till" });
    await closing.getByRole("button", { name: /^Yes, close with/ }).click();
    await page.getByRole("button", { name: "Done (sign out)" }).click();
    await page.waitForURL(/\/login/);

    await login(page, "cashier@demo-store.test", "CashierPass123!");
    await openPosWithProducts(page);
    await expect(page.getByText("Cart is empty — scan or search a product to begin.")).toBeVisible();
    await expect(email()).toHaveValue("");
    // The parked sale is with the held orders, for whoever serves that customer.
    await page.getByRole("button", { name: /^Held orders/ }).click();
    await expect(page.getByRole("dialog")).not.toContainText("No orders on hold.");
    await page.keyboard.press("Escape");
    await logOut(page);
  });

  test("a completed sale empties the cart; its receipt is in Portuguese with DD/MM/YYYY", async () => {
    await login(page);
    await openPosWithProducts(page);
    await products().first().click();
    await charge().click();
    const done = page.getByRole("dialog");
    await expect(done).toContainText("Sale complete"); // the screen: English
    await expect(done).toContainText("Factura-Recibo");
    await expect(done).toContainText(/IVA incluído|IVA/);
    await expect(done).not.toContainText("Tax included");
    await expect(done).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    await page.keyboard.press("Escape");
    await expect(page.getByText("Cart is empty — scan or search a product to begin.")).toBeVisible();
    await page.getByRole("link", { name: "Back to dashboard" }).click();
    await page.getByRole("link", { name: /^Back to POS/ }).click();
    await expect(page.getByText("Cart is empty — scan or search a product to begin.")).toBeVisible();
  });

  test("date fields show and take DD/MM/YYYY", async () => {
    await page.goto("app://pos/sales");
    const from = page.locator("#sales-from");
    await from.fill("01/10/2026");
    await from.blur();
    await expect(from).toHaveValue("01/10/2026");
    await expect(from).toHaveAttribute("placeholder", "DD/MM/YYYY");
    await from.fill("");
  });
});
