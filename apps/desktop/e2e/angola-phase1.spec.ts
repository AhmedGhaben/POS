import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 1: a cashier signing in after a manager gets
 * their own permissions straight away (no restart), and dropdown options
 * can be picked with the mouse.
 */
/** Sets the signed-in person's language and returns what it was (the tests read English text). */
async function setMyLanguage(page: Page, language: string | null): Promise<string | null> {
  const previous = await page.evaluate(async (language) => {
    const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
    const before = auth.user.language ?? null;
    if (language) {
      const res = await fetch("/api/users/me/language", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) throw new Error(`language ${res.status}`);
      const stored = JSON.parse(localStorage.getItem("pos-auth")!);
      stored.state.user.language = language;
      localStorage.setItem("pos-auth", JSON.stringify(stored));
    }
    return before;
  }, language);
  if (language) await page.reload();
  return previous;
}

async function addFirstProduct(page: Page) {
  await openPosWithProducts(page);
  await page.locator("div.grid > button.text-left").first().click();
}

/**
 * The same without reloading the page: after signing in, a cashier lands on
 * the POS in the same page, which is where stale cached data used to leak.
 */
async function addFirstProductInPlace(page: Page) {
  await page.waitForURL(/\/pos$/);
  await page.getByRole("button", { name: "All", exact: true }).locator("xpath=following-sibling::button[1]").click();
  await page.locator("div.grid > button.text-left").first().click();
}

test.describe.serial("Angola phase 1: account switch and dropdowns", () => {
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
    ownerLanguage = await setMyLanguage(page, "en");
    await restock(page);
  });

  test.afterAll(async () => {
    // Put the owner's language back, signing in as them whoever is signed in now.
    if (ownerLanguage && ownerLanguage !== "en") {
      await page
        .evaluate(async (language) => {
          const login = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "owner@demo-store.test", password: "OwnerPass123!" }),
          });
          const { accessToken } = await login.json();
          await fetch("/api/users/me/language", {
            method: "PATCH",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ language }),
          });
        }, ownerLanguage)
        .catch(() => {});
    }
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("a customer can be picked from the dropdown with the mouse", async () => {
    const name = `Mouse Pick ${Date.now()}`;
    await page.evaluate(async (name) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`customer ${res.status}`);
    }, name);

    await openPosWithProducts(page);
    await page.getByRole("combobox", { name: "Walk-in customer" }).click();
    await page.getByPlaceholder("Search customers...").fill(name);
    await page.getByRole("option", { name }).click();
    await expect(page.getByRole("combobox", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear customer" }).click();
  });

  test("the owner can discount; the cashier who signs in next can't, without a restart", async () => {
    await addFirstProduct(page);
    await expect(page.getByRole("button", { name: /^Discount on / }).first()).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/login/);
    await login(page, "cashier@demo-store.test", "CashierPass123!");
    await addFirstProductInPlace(page);
    // Their own permissions arrive from the server; the owner's must never show up meanwhile.
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.permissions?.APPLY_DISCOUNT))
      .toBe(false);
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /^Discount on / })).toHaveCount(0);

    // And back: the owner's rights return the same way.
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/login/);
    await login(page);
    await addFirstProduct(page);
    await expect(page.getByRole("button", { name: /^Discount on / }).first()).toBeVisible();

    // Signed in as the owner again: put their language back now.
    if (ownerLanguage && ownerLanguage !== "en") await setMyLanguage(page, ownerLanguage);
    ownerLanguage = null;
  });
});
