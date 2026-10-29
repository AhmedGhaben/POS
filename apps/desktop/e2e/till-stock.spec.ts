import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, registerTill, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * Tester #32: the till only said "Insufficient stock" at Charge. It now
 * warns (or refuses) as the item is added, the business can allow selling
 * without stock, and a till can hide what has run out.
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

test.describe.serial("Till: selling more than is in stock", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let product: { id: string; name: string };
  const tile = () => page.locator("div.grid > button.text-left").filter({ hasText: product.name });
  const quantity = () => page.getByLabel(`Quantity of ${product.name}`);

  async function setStock(quantity: number) {
    await api(page, `/stores/${await storeId(page)}/inventory/${product.id}`, { method: "PUT", body: { quantity } });
  }
  async function setAllowed(allowed: boolean) {
    await page.goto("app://pos/settings");
    const box = page.getByLabel("Allow selling without stock");
    if ((await box.isChecked()) !== allowed) {
      await box.setChecked(allowed);
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Settings saved", { exact: false }).first()).toBeVisible();
    }
  }
  async function emptyCart() {
    const clear = page.getByRole("button", { name: "Clear cart", exact: true });
    if (await clear.isEnabled()) await clear.click();
    await expect(clear).toBeDisabled();
  }

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    await registerTill(page, "Stock Till");
    await openPosWithProducts(page);
    const name = (await page.locator("div.grid > button.text-left").first().locator("span.font-medium").textContent())!.trim();
    const [found] = await api<{ id: string; name: string }[]>(page, `/products?search=${encodeURIComponent(name)}`);
    product = found;
  });

  test.afterAll(async () => {
    await emptyCart().catch(() => {});
    await setStock(200).catch(() => {});
    await setAllowed(false).catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("refuses the third when only two are in stock", async () => {
    await setAllowed(false);
    await setStock(2);
    const fresh = page.waitForResponse(async (response) => response.url().includes("/inventory/levels") && response.status() === 200 &&
      (await response.json() as { productId: string; quantity: string }[]).some((row) => row.productId === product.id && Number(row.quantity) === 2));
    await openPosWithProducts(page);
    await (await fresh).finished();
    await emptyCart();
    await tile().click();
    await tile().click();
    await expect(quantity()).toHaveValue("2");
    await tile().click();
    await expect(page.getByText(`Only 2 of "${product.name}" in stock`).first()).toBeVisible();
    await expect(quantity()).toHaveValue("2");
  });

  test("with selling without stock allowed, it warns and lets it through", async () => {
    await setAllowed(true);
    await openPosWithProducts(page);
    await tile().click();
    await expect(page.getByText(`Only 2 of "${product.name}" in stock`).first()).toBeVisible();
    await expect(quantity()).toHaveValue("3");
    await expect(page.getByText("2 in stock")).toBeVisible();
    await emptyCart();
    await setAllowed(false);
  });

  test("a till can hide products that have run out", async () => {
    await setStock(0);
    const fresh = page.waitForResponse(async (response) => response.url().includes("/inventory/levels") && response.status() === 200 &&
      (await response.json() as { productId: string; quantity: string }[]).some((row) => row.productId === product.id && Number(row.quantity) === 0));
    await openPosWithProducts(page);
    await (await fresh).finished();
    const hide = page.getByRole("button", { name: "Hide products out of stock (this till)" });
    await hide.click();
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(tile()).toHaveCount(0);
    await hide.click();
    await expect(tile()).toHaveCount(1);
  });
});
