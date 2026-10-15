import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 4 in the app: a customer with a credit limit,
 * a sale put on their account at the till (part paid now), a payment taken
 * from the customer card with its Recibo, a purchase with the supplier's
 * document, IVA and IVA cativo, and paying the supplier. Uses names of its
 * own, so the demo data's other customers and suppliers don't matter.
 */
async function api<T>(page: Page, path: string, body: unknown): Promise<T> {
  return page.evaluate(
    async ({ path, body }) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const res = await fetch(`/api${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${path} ${res.status}`);
      return res.json();
    },
    { path, body },
  ) as Promise<T>;
}

test.describe.serial("Angola phase 4: credit at the till, receipts and payables", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  const RUN = Date.now();
  const customerName = `Obras Credito ${RUN}`;
  const supplierName = `Fornecedor Teste ${RUN}`;
  let app: ElectronApplication;
  let page: Page;

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

  test("Customers: a new customer with a credit limit", async () => {
    await page.getByRole("link", { name: "Customers" }).click();
    await page.getByRole("button", { name: "New customer" }).click();
    const dialog = page.getByRole("dialog", { name: "New customer" });
    await dialog.getByLabel("Name").fill(customerName);
    await dialog.getByLabel("NIF").fill("5000111222");
    await dialog.getByLabel("Credit limit").fill("1000000");
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.getByLabel("Search by name, phone or NIF").fill(customerName);
    await expect(page.getByRole("row", { name: new RegExp(customerName) })).toContainText("1 000 000,00");
  });

  test("the till: on the customer's account, part paid now; the Factura says what's on account", async () => {
    await openPosWithProducts(page);
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("combobox", { name: "Walk-in customer" }).click();
    await page.getByPlaceholder("Search customers...").fill(customerName);
    await page.getByRole("option", { name: new RegExp(customerName) }).click();
    await page.getByLabel(`Put on ${customerName}'s account`).check();
    await expect(page.getByText(/^Credit left:/)).toBeVisible();
    await page.getByLabel("Paid now (optional)").fill("1");
    await expect(page.getByText(/^On account: /)).toBeVisible();
    await page.getByRole("button", { name: /^Charge/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Sale complete");
    await expect(dialog).toContainText("Factura");
    await expect(dialog).toContainText("On account");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("the customer card: what they owe, and a payment in cash with its Recibo", async () => {
    await page.getByRole("combobox", { name: "Walk-in customer" }).click();
    await page.getByPlaceholder("Search customers...").fill(customerName);
    await page.getByRole("option", { name: new RegExp(customerName) }).click();
    await page.getByRole("button", { name: "Customer card" }).click();
    const card = page.getByRole("dialog", { name: customerName });
    await expect(card).toContainText("Owes");
    await card.getByRole("button", { name: "Receive payment" }).click();
    const pay = page.getByRole("dialog", { name: `Payment from ${customerName}` });
    await expect(pay.getByRole("combobox", { name: "Paid with" })).toContainText("Cash");
    await pay.getByRole("button", { name: /^Receive/ }).click();
    await expect(page.getByText(/^Receipt RC .* issued$/)).toBeVisible();
    const receipt = page.getByRole("dialog", { name: /^Recibo RC / });
    await expect(receipt).toContainText("Document settled");
    await expect(receipt).toContainText(/FT \S+\/\d+/);
    await page.keyboard.press("Escape");
  });

  test("Customers: the account shows the invoice paid and the receipt", async () => {
    await page.goto("app://pos/customers");
    await page.getByLabel("Search by name, phone or NIF").fill(customerName);
    const row = page.getByRole("row", { name: new RegExp(customerName) });
    await row.getByRole("button", { name: "Account" }).click();
    await expect(page.getByTestId("account-balance")).toHaveText(/^0,00/);
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
    await expect(page.getByText(/^RC \S+\/\d+$/).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("a purchase with the supplier's FT, IVA 14% and IVA cativo 50%, part paid; then paying the rest", async () => {
    await api(page, "/suppliers", { name: supplierName, taxId: "5401999888" });
    await page.goto("app://pos/purchases");
    await page.getByRole("button", { name: "New purchase" }).click();
    const form = page.getByRole("dialog", { name: "New purchase" });
    await form.getByRole("combobox", { name: "Supplier" }).click();
    await page.getByPlaceholder("Type to search...").fill(supplierName);
    await page.getByRole("option", { name: supplierName }).click();
    await form.getByRole("combobox", { name: "Product" }).click();
    await page.getByRole("option").first().click();
    await form.getByPlaceholder("Qty").fill("2");
    await form.getByPlaceholder("Unit cost").fill("100");
    await form.getByLabel("Number").fill(`FT SUP${RUN}/7`);
    await form.getByLabel("Date").fill("2026-10-10");
    await form.getByRole("combobox", { name: "Rate" }).click();
    await page.getByRole("option", { name: /^14%/ }).click();
    await form.getByRole("combobox", { name: /IVA cativo/ }).click();
    await page.getByRole("option", { name: "50%" }).click();
    // 200 + 28 IVA; 14 withheld for the State: 214 owed to the supplier.
    await expect(form.getByTestId("purchase-totals")).toContainText("214,00");
    await form.getByLabel("Amount").fill("100");
    await form.getByRole("button", { name: "Record purchase" }).click();
    await expect(page.getByRole("row", { name: new RegExp(`FT SUP${RUN}/7`) })).toContainText("Part paid");

    await page.goto("app://pos/suppliers");
    await page.getByRole("row", { name: new RegExp(supplierName) }).getByRole("button", { name: "Account" }).click();
    await expect(page.getByTestId("supplier-balance")).toHaveText(/^114,00/);
    await page.getByRole("button", { name: "Pay supplier" }).click();
    const pay = page.getByRole("dialog", { name: `Pay ${supplierName}` });
    await expect(pay.getByLabel("Amount")).toHaveValue("114.00");
    await pay.getByRole("button", { name: /^Pay / }).click();
    await expect(page.getByTestId("supplier-balance")).toHaveText(/^0,00/);
  });
});
