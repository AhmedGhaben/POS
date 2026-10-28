import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, tempUserData } from "./helpers";

/**
 * The product form after the third test report: the stock shown before
 * archiving (tester #36), no price of 0 unless free (#39), and the SKU
 * suggested from the category's prefix (#40).
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
      return res.status === 204 ? null : res.json();
    },
    { path, init },
  ) as Promise<T>;
}

test.describe.serial("Products: stock, prices and SKUs", () => {
  const userData = tempUserData();
  const prefix = `Q${String(Date.now()).slice(-5)}`;
  let app: ElectronApplication;
  let page: Page;
  let category: { id: string; name: string };

  test.beforeAll(async () => {
    ({ app, page } = await launch(userData));
    await connect(page, API_URL);
    await login(page);
    category = await api(page, "/categories", { method: "POST", body: { name: `Prefixed ${prefix}`, skuPrefix: prefix } });
  });

  test.afterAll(async () => {
    const made = await api<{ id: string }[]>(page, `/products?search=${prefix}-`).catch(() => []);
    for (const p of made) await api(page, `/products/${p.id}`, { method: "PATCH", body: { isActive: false } }).catch(() => {});
    await api(page, `/categories/${category.id}`, { method: "DELETE" }).catch(() => {});
    await app?.close();
  });

  test("a new product in a category with a prefix gets its next SKU", async () => {
    await page.goto("app://pos/products");
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Category").click();
    await page.getByRole("option", { name: category.name }).click();
    await expect(dialog.getByLabel("SKU")).toHaveValue(`${prefix}-001`);
    await expect(dialog.getByText("Suggested from the category; you can change it.")).toBeVisible();
    await dialog.getByLabel("Name").fill("Prefixed cable");
    await dialog.getByLabel("Cost price").fill("1");
    await dialog.getByLabel("Sell price").fill("3");
    await dialog.getByRole("button", { name: "Save product" }).click();
    await expect(dialog).toBeHidden();
    const [saved] = await api<{ sku: string }[]>(page, `/products?search=${prefix}-001`);
    expect(saved.sku).toBe(`${prefix}-001`);
  });

  test("a sell price of 0 asks for \"Free item\"", async () => {
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Zero test");
    await dialog.getByLabel("SKU").fill(`${prefix}-ZERO`);
    await dialog.getByLabel("Cost price").fill("0");
    await dialog.getByLabel("Sell price").fill("0");
    await dialog.getByRole("button", { name: "Save product" }).click();
    await expect(dialog.getByText('Enter a price above 0, or tick "Free item"')).toBeVisible();
    await dialog.getByLabel("Free item").check();
    await expect(dialog.getByLabel("Sell price")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("archiving a product with stock shows the stock and asks first", async () => {
    const [product] = await api<{ id: string; name: string }[]>(page, "/products?search=Avocado");
    const store = await page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.currentStoreId as string);
    await api(page, `/stores/${store}/inventory/${product.id}`, { method: "PUT", body: { quantity: 12 } });
    await page.getByPlaceholder("Search by name, SKU, or barcode...").fill(product.name);
    await page.getByRole("button", { name: `Edit ${product.name}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Archive product" }).click();
    await expect(dialog.getByRole("alert")).toContainText("still has stock");
    await expect(dialog.getByRole("alert")).toContainText("12 in stock");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    // Delete: the stock is shown and the product can't be deleted.
    await dialog.getByRole("button", { name: "Delete product for good" }).click();
    await expect(dialog.getByRole("alert")).toContainText("can't be deleted");
    await page.keyboard.press("Escape");
  });
});
