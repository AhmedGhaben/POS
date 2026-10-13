import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, logOut, openPosWithProducts, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 3 at the till: typed quantities and the "3*"
 * shortcut, held orders, a cashier's price change and cash out approved by
 * a manager's PIN (the cashier stays signed in).
 */
const OWNER_PIN = "8642";

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) await page.keyboard.press(digit);
  await page.keyboard.press("Enter");
}

test.describe.serial("Angola phase 3: checkout at the till", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  const firstTile = () => page.locator("div.grid > button.text-left").first();

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

  test("a quantity can be typed on a line, or added with 3* in the search", async () => {
    await openPosWithProducts(page);
    const name = (await firstTile().locator("p").first().textContent())!.trim();
    await firstTile().click();
    const qty = page.getByLabel(`Quantity of ${name}`);
    await qty.fill("4");
    await qty.press("Enter");
    await expect(qty).toHaveValue("4");
    await qty.fill("abc");
    await qty.press("Enter");
    await expect(qty).toHaveValue("4");

    const search = page.getByPlaceholder("Scan barcode or search by name / SKU...");
    await search.fill(`3*${name}`);
    await search.press("Enter");
    await expect(qty).toHaveValue("7");
    await page.getByRole("button", { name: "Clear cart" }).click();
  });

  test("an order can be held, another served, and the first resumed", async () => {
    await firstTile().click();
    await page.getByRole("button", { name: "Hold order" }).click();
    await page.getByLabel("Note").fill("Lady in blue");
    await page.getByRole("dialog").getByRole("button", { name: "Hold order" }).click();
    await expect(page.getByText("Cart is empty", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: /^Held orders/ }).click();
    const sheet = page.getByRole("dialog", { name: "Held orders" });
    await expect(sheet).toContainText("Lady in blue");
    await sheet.getByRole("button", { name: "Resume Lady in blue" }).click();
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeEnabled();
    await page.getByRole("button", { name: "Clear cart" }).click();
  });

  test("a cashier changes a price with the owner's PIN, and stays signed in", async () => {
    await logOut(page);
    await login(page, "cashier@demo-store.test", "CashierPass123!");
    await openPosWithProducts(page);
    const name = (await firstTile().locator("p").first().textContent())!.trim();
    await firstTile().click();
    await page.getByRole("button", { name: `Change the price of ${name}` }).click();
    await page.getByLabel("New price (each)").fill("0.50");
    await page.getByRole("button", { name: "Ask a manager" }).click();

    const approval = page.getByRole("dialog", { name: "Manager approval" });
    await approval.getByRole("button", { name: "Ada Owner" }).click();
    await enterPin(page, OWNER_PIN);
    await expect(approval).toBeHidden();
    await expect(page.getByText(/\(was /)).toBeVisible();

    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    await page.keyboard.press("Escape");
    const user = await page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.user);
    expect(user.email).toBe("cashier@demo-store.test");
  });

  test("cash out needs a manager; cash in doesn't", async () => {
    await page.getByRole("button", { name: "Cash in / out" }).click();
    await page.getByRole("radio", { name: "Cash out" }).click();
    await page.getByLabel("Amount").fill("1");
    await page.getByRole("button", { name: "Take cash out" }).click();
    const approval = page.getByRole("dialog", { name: "Manager approval" });
    await expect(approval).toContainText("Take");
    await approval.getByRole("button", { name: "Ada Owner" }).click();
    await enterPin(page, OWNER_PIN);
    await expect(page.getByText(/taken out/).first()).toBeVisible();
    await logOut(page);
  });
});
