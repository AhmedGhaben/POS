import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 2: one searchable dropdown everywhere. Type to
 * filter, pick with the mouse or the keyboard, Esc closes; it works inside
 * dialogs too.
 */

/** The tests read English text; returns the language to put back. */
async function useEnglish(page: Page): Promise<string | null> {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.user.language ?? null);
  if (before && before !== "en") await setLanguage(page, "en");
  return before;
}

async function setLanguage(page: Page, language: string) {
  await page.evaluate(async (language) => {
    const auth = JSON.parse(localStorage.getItem("pos-auth")!);
    const res = await fetch("/api/users/me/language", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${auth.state.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    if (!res.ok) throw new Error(`language ${res.status}`);
    auth.state.user.language = language;
    localStorage.setItem("pos-auth", JSON.stringify(auth));
  }, language);
  await page.reload();
}

test.describe.serial("Angola phase 2: searchable dropdowns", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let ownerLanguage: string | null = null;

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    ownerLanguage = await useEnglish(page);
  });

  test.afterAll(async () => {
    if (ownerLanguage && ownerLanguage !== "en") await setLanguage(page, ownerLanguage).catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("keyboard: type on the closed dropdown to filter, arrows + Enter to pick, Esc closes", async () => {
    await openPosWithProducts(page);
    const method = page.getByRole("combobox", { name: "Payment method" });
    await expect(method).toContainText("Cash");

    await method.focus();
    await page.keyboard.type("car");
    await expect(page.getByPlaceholder("Type to search...")).toHaveValue("car");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(method).toContainText("Card");

    // Arrow down opens it; Esc closes it without changing anything.
    await method.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(method).toContainText("Card");

    await method.click();
    await page.keyboard.type("cash");
    await page.getByRole("option", { name: "Cash" }).click();
    await expect(method).toContainText("Cash");
  });

  test("mouse, inside a dialog: pick a category on a product and clear it again", async () => {
    // A seeded category: the till lists every category, so tests don't add empty ones.
    const category = "Personal Care";

    await page.goto("app://pos/products");
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog");
    const picker = dialog.getByRole("combobox", { name: "Category" });
    await picker.click();
    await page.getByPlaceholder("Type to search...").fill("PERSONAL car");
    await page.getByRole("option", { name: category }).click();
    await expect(picker).toContainText(category);
    await expect(dialog).toBeVisible();

    await picker.click();
    await page.getByRole("option", { name: "Uncategorized" }).click();
    await expect(picker).toContainText("Uncategorized");
    await page.keyboard.press("Escape");
  });

  test("the customer picker searches the server and offers to add a new customer", async () => {
    const name = `Combo Cliente ${Date.now()}`;
    await openPosWithProducts(page);
    const picker = page.getByRole("combobox", { name: "Walk-in customer" });
    await picker.click();
    await page.getByPlaceholder("Search customers...").fill(name);
    await page.getByRole("button", { name: `Add "${name}" as new customer` }).click();
    const dialog = page.getByRole("dialog", { name: "New customer" });
    await expect(dialog.getByLabel("Name")).toHaveValue(name);
    await dialog.getByLabel("Phone (optional)").fill("923000000");
    await dialog.getByRole("button", { name: "Create & select" }).click();
    await expect(page.getByRole("combobox", { name })).toBeVisible();

    // Found again by phone number.
    await page.getByRole("button", { name: "Clear customer" }).click();
    await page.getByRole("combobox", { name: "Walk-in customer" }).click();
    await page.getByPlaceholder("Search customers...").fill("923000000");
    await page.getByRole("option", { name: new RegExp(name) }).click();
    await expect(page.getByRole("combobox", { name })).toBeVisible();
    await page.getByRole("button", { name: "Clear customer" }).click();
  });
});
