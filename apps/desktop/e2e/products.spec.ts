import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, tempUserData } from "./helpers";

/**
 * Editing products from the Products page: change the name and price, see
 * the change at the till, archive (gone from the till) and restore. Uses
 * the seeded demo store; the test product is archived again at the end.
 */
test.describe.serial("Products: edit and archive", () => {
  const userData = tempUserData();
  const sku = `EDIT-${Date.now()}`;
  let app: ElectronApplication;
  let page: Page;

  async function posSearch(text: string) {
    await page.goto("app://pos/pos");
    const search = page.getByPlaceholder("Scan barcode or search by name / SKU...");
    await search.fill(text);
    return page.locator("div.absolute button");
  }

  test.beforeAll(async () => {
    ({ app, page } = await launch(userData));
    await connect(page, API_URL);
    await login(page);
  });

  test.afterAll(async () => {
    // Leave the demo catalog as it was.
    await page
      .evaluate(async (s) => {
        const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
        const headers = { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" };
        for (const archived of ["false", "true"]) {
          const list = await (await fetch(`/api/products?search=${s}&archived=${archived}`, { headers })).json();
          for (const p of list) {
            await fetch(`/api/products/${p.id}`, { method: "PATCH", headers, body: JSON.stringify({ isActive: false }) });
          }
        }
      }, sku)
      .catch(() => {});
    await app?.close();
  });

  test("create a product, then change its name and price", async () => {
    await page.goto("app://pos/products");
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Edit test soap");
    await dialog.getByLabel("SKU").fill(sku);
    await dialog.getByLabel("Cost price").fill("1");
    await dialog.getByLabel("Sell price").fill("2.50");
    await dialog.getByRole("button", { name: "Save product" }).click();
    await expect(dialog).toBeHidden();

    await page.getByPlaceholder("Search by name, SKU, or barcode...").fill(sku);
    await page.getByRole("button", { name: "Edit Edit test soap" }).click();
    await expect(dialog.getByRole("heading", { name: "Edit product" })).toBeVisible();
    await expect(dialog.getByLabel("Name")).toHaveValue("Edit test soap");
    await expect(dialog.getByLabel("Sell price")).toHaveValue("2.5");

    await dialog.getByLabel("Name").fill("Lavender soap");
    await dialog.getByLabel("Sell price").fill("3.75");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("cell", { name: "Lavender soap", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: /3\.75/ })).toBeVisible();
  });

  test("the till sells it under the new name and price", async () => {
    const results = await posSearch(sku);
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText("Lavender soap");
    await expect(results.first()).toContainText("3.75");
  });

  test("a SKU that's already taken is refused with a clear message", async () => {
    await page.goto("app://pos/products");
    await page.getByPlaceholder("Search by name, SKU, or barcode...").fill(sku);
    await page.getByRole("cell", { name: "Lavender soap", exact: true }).click();
    const dialog = page.getByRole("dialog");
    // Any other product's SKU from the demo catalog.
    const otherSku = await page.evaluate(async (own) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const list = await (await fetch("/api/products", { headers: { Authorization: `Bearer ${auth.accessToken}` } })).json();
      return (list as { sku: string }[]).find((p) => p.sku !== own)!.sku;
    }, sku);
    await dialog.getByLabel("SKU").fill(otherSku);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("SKU already exists")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("archive hides it from the list and the till; restore brings it back", async () => {
    await page.goto("app://pos/products");
    await page.getByPlaceholder("Search by name, SKU, or barcode...").fill(sku);
    await page.getByRole("cell", { name: "Lavender soap", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive product" }).click();
    await expect(page.getByText("Product archived")).toBeVisible();
    await expect(page.getByText("No products yet.")).toBeVisible();

    await expect(await posSearch(sku)).toHaveCount(0);

    await page.goto("app://pos/products");
    await page.getByLabel("Show archived products").check();
    await page.getByPlaceholder("Search by name, SKU, or barcode...").fill(sku);
    await page.getByRole("cell", { name: "Lavender soap", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restore product" }).click();
    await expect(page.getByText("Product restored")).toBeVisible();
    await expect(page.getByText("No archived products.")).toBeVisible();

    await expect(await posSearch(sku)).toHaveCount(1);
  });
});
