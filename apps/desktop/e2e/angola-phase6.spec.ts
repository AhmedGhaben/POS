import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, SwitchableProxy, tempUserData } from "./helpers";

/** A 1x1 PNG, as a phone photo stand-in. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/**
 * docs/plans/ANGOLA.md, phase 6 in the app: a product sold by weight and
 * exempt with a reason, with a photo; a scanner's Enter in the barcode
 * field doesn't save; duplicate barcodes are flagged; categories are
 * managed; 0,5 kg is sold at the till; the stock history and the stock at
 * a date. Archives what it creates.
 */
async function api<T>(page: Page, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return page.evaluate(
    async ({ path, init }) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const res = await fetch(`/api${path.replace(":store", auth.currentStoreId)}`, {
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

test.describe.serial("Angola phase 6: products, units, tax and stock", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  const RUN = Date.now();
  const name = `Queijo da Serra ${RUN}`;
  const barcode = `2${RUN}`.slice(0, 13);
  let app: ElectronApplication;
  let page: Page;
  let productId: string | null = null;

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
  });

  test.afterAll(async () => {
    if (productId) await api(page, `/products/${productId}`, { method: "PATCH", body: { isActive: false } }).catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("a product sold by weight, exempt with its reason, with a photo; a scanner's Enter doesn't save it", async () => {
    await page.goto("app://pos/products");
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("SKU").fill(`QS-${RUN}`);
    // The scanner types the code and presses Enter.
    await dialog.getByLabel("Barcode").fill(barcode);
    await dialog.getByLabel("Barcode").press("Enter");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox", { name: "Unit" }).click();
    await page.getByPlaceholder("Type to search...").fill("kilo");
    await page.getByRole("option", { name: /Kilogram/ }).click();
    await dialog.getByLabel("Price per kg").fill("2500");

    await dialog.getByRole("combobox", { name: "Tax", exact: true }).click();
    await page.getByPlaceholder("Type to search...").fill("isento");
    await page.getByRole("option", { name: /Exempt \(Isento\)/ }).click();
    await dialog.getByRole("combobox", { name: "Exemption reason" }).click();
    await page.getByPlaceholder("Type to search...").fill("M10");
    await page.getByRole("option").first().click();

    await page.getByTestId("product-photo-input").setInputFiles({ name: "queijo.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByRole("button", { name: "Change the photo" })).toBeVisible();

    await dialog.getByRole("button", { name: "Save product" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toContainText("Exempt (M10)");
    await expect(row).toContainText("/kg");
    await expect(row.locator("img")).toHaveCount(1);

    const [product] = await api<{ id: string; unit: string; exemptionCode: string; photoId: string | null }[]>(page, `/products?search=${encodeURIComponent(name)}`);
    productId = product.id;
    expect(product).toMatchObject({ unit: "kg", exemptionCode: "M10" });
    expect(product.photoId).toBeTruthy();
  });

  test("a barcode already in use is flagged while typing", async () => {
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Barcode").fill(barcode);
    await expect(dialog.getByRole("alert")).toContainText(`Already used by "${name}"`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("categories: add, rename and delete", async () => {
    const category = `Lacticínios ${RUN}`;
    await page.getByRole("button", { name: "Categories" }).click();
    const dialog = page.getByRole("dialog", { name: "Categories" });
    await dialog.getByLabel("New category name").fill(category);
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(dialog.getByText(category)).toBeVisible();

    await dialog.getByRole("button", { name: `Rename ${category}` }).click();
    await dialog.getByLabel(`New name for ${category}`).fill(`${category} frescos`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText(`${category} frescos`)).toBeVisible();

    await dialog.getByRole("button", { name: `Delete ${category} frescos` }).click();
    await dialog.getByRole("button", { name: "Delete category" }).click();
    await expect(dialog.getByText(`${category} frescos`)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("the till sells half a kilo by scanning '0,5*' and the barcode", async () => {
    await api(page, `/stores/:store/inventory/${productId}`, { method: "PUT", body: { quantity: 3 } });
    await openPosWithProducts(page);
    const search = page.getByPlaceholder("Scan barcode or search by name / SKU...");
    await search.fill(`0,5*${barcode}`);
    await search.press("Enter");
    await expect(page.getByLabel(`Quantity of ${name}`)).toHaveValue("0.5");
    await expect(page.getByText(/2,500\.00\/kg/).first()).toBeVisible();

    await page.getByRole("button", { name: /^Charge/ }).click();
    const done = page.getByRole("dialog");
    await expect(done).toContainText("Sale complete");
    await expect(done).toContainText(`0.5 kg x ${name}`);
    await page.keyboard.press("Escape");
    await expect(done).toBeHidden();

    const item = (await api<{ productId: string; quantity: string }[]>(page, "/stores/:store/inventory")).find((i) => i.productId === productId);
    expect(item?.quantity).toBe("2.5");
  });

  test("inventory: the stock history and the stock at today's date", async () => {
    await page.goto("app://pos/inventory");
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("kg");
    await page.getByRole("button", { name: `Stock history of ${name}` }).click();
    const history = page.getByRole("dialog");
    await expect(history.getByRole("row").nth(1)).toContainText("Sale");
    await expect(history.getByRole("row").nth(1)).toContainText("-0.5 kg");
    await page.keyboard.press("Escape");
    await expect(history).toBeHidden();

    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await page.getByLabel("Date").fill(today);
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) }).last()).toContainText("2.5 kg");
  });
});
