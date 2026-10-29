import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { API_URL, connect, launch, outbox, registerTill, tempUserData } from "./helpers";

test.skip(process.env.POS_FREE_POLICY_TESTS !== "1", "Requires fresh isolated API/database and POS_FREE_POLICY_TESTS=1");
let db: PrismaClient;
test.beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/); expect(url.pathname).toContain("test");
  expect(new URL(API_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/); db = new PrismaClient();
});
test.afterAll(async () => { await db?.$disconnect(); });

for (const mode of ["browser", "electron"] as const) test(`${mode}: justified PIN approval, free stock movement, then offline refusal`, async ({ request }) => {
  const password = "FreePolicy123!", email = `free-ui-${mode}-${Date.now()}@e2e.test`;
  const response = await request.post(`${API_URL}/auth/register`, { data: { businessName: "Free UI test", storeName: "Test", firstName: "Test", lastName: "Owner", email, password, language: "en" } });
  expect(response.status()).toBe(201); const session = await response.json(), storeId = session.stores[0].id;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const managerEmail = `manager-${email}`;
  expect((await request.post(`${API_URL}/employees`, { headers, data: { firstName: "Sample", lastName: "Manager", login: { email: managerEmail, role: "MANAGER", storeIds: [storeId], password } } })).status()).toBe(201);
  const manager = await (await request.post(`${API_URL}/auth/login`, { data: { email: managerEmail, password } })).json();
  expect((await request.put(`${API_URL}/users/me/pin`, { headers: { Authorization: `Bearer ${manager.accessToken}` }, data: { pin: "8642", password } })).status()).toBe(200);
  const category = await (await request.post(`${API_URL}/categories`, { headers, data: { name: "Samples" } })).json();
  const productResponse = await request.post(`${API_URL}/products`, { headers, data: { sku: "SAMPLE", name: "Free sample", categoryId: category.id, costPrice: 0, sellPrice: 0, isFree: true, exemptionCode: "M10" } });
  expect(productResponse.status()).toBe(201); const product = await productResponse.json();
  expect((await request.put(`${API_URL}/stores/${storeId}/inventory/${product.id}`, { headers, data: { quantity: 5 } })).status()).toBe(200);
  let app: ElectronApplication | undefined, page: Page;
  const browser = mode === "browser" ? await chromium.launch({ channel: "msedge", headless: true }) : undefined;
  if (browser) page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  else { ({ app, page } = await launch(tempUserData())); await connect(page, API_URL); }
  try {
    const origin = app ? "app://pos" : process.env.POS_TEST_WEB_URL!;
    await page.goto(`${origin}/login`);
    await page.evaluate((s) => {
      localStorage.setItem("pos-auth", JSON.stringify({ state: { accessToken: s.accessToken, user: s.user, stores: s.stores, business: s.business, currentStoreId: s.stores[0].id, offline: false, permissions: null }, version: 0 }));
      localStorage.setItem("pos-device-role", JSON.stringify({ state: { role: "TILL" }, version: 0 })); localStorage.setItem("pos-language", "en");
    }, session);
    if (app) { await page.reload(); await registerTill(page, "Free policy till"); }
    await page.goto(`${origin}/pos`); await page.getByLabel("Opening float").fill("0"); await page.getByRole("button", { name: "Open the till", exact: true }).click();
    await page.getByRole("button", { name: "Samples", exact: true }).click();
    const tile = page.locator("div.grid > button.text-left").filter({ hasText: product.name }), charge = page.getByRole("button", { name: /^Charge/ });
    await tile.click(); await charge.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Manager approval" }); await expect(dialog).toContainText("Free sample");
    await dialog.getByRole("button", { name: "Sample Manager", exact: true }).click();
    for (const digit of "8642") await dialog.getByRole("button", { name: digit, exact: true }).click();
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await expect(dialog).toBeVisible(); expect(await db.sale.count({ where: { storeId } })).toBe(0);
    // Digits in the reason must not be swallowed by the global PIN-pad keys.
    await dialog.getByLabel("Justification (required)").fill("Sample for customer 123");
    const accepted = page.waitForResponse((r) => r.url().endsWith("/sales") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "OK", exact: true }).click(); expect((await accepted).status()).toBe(201);
    const completed = page.getByRole("dialog").filter({ hasText: "Sale complete" }); await expect(completed).toContainText(/FR .*\/1/);
    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: session.user.businessId, action: "ZERO_PRICE_SALE_APPROVED" } });
    expect(audit.metadata).toMatchObject({ approvedById: manager.user.id, justification: "Sample for customer 123" });
    expect(await db.stockMovement.count({ where: { storeId, type: "SALE" } })).toBe(1);
    await page.keyboard.press("Escape"); await tile.click(); await page.context().setOffline(true);
    await expect(page.getByTestId("sync-status")).toContainText("Working offline"); await charge.click();
    await expect(page.getByText("Zero-price sales require online manager approval and a justification.", { exact: true })).toBeVisible();
    expect((await outbox(page)).filter((e) => e.kind === "sale")).toHaveLength(0);
    expect(await db.sale.count({ where: { storeId } })).toBe(1);
    await expect(page.getByLabel(`Quantity of ${product.name}`)).toHaveValue("1");
  } finally { await browser?.close(); await app?.close(); }
});
