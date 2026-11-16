import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, launch, tempUserData } from "./helpers";

/**
 * A new till opens in Angolan Portuguese, whatever the computer's language:
 * the first-run setup and then the app. (The other tests choose English.)
 */
test.describe.serial("First run: pt-AO", () => {
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    ({ app, page } = await launch(userData, {}, null));
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  test("the setup page is in Portuguese", async () => {
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-AO");
    await expect(page.getByRole("heading", { name: "Ligar esta caixa" })).toBeVisible();
  });

  test("after connecting, the app is in pt-AO too", async () => {
    await page.getByLabel("Endereço do servidor").fill(API_URL);
    await page.getByRole("button", { name: "Ligar" }).click();
    await page.waitForURL(/^app:\/\/pos\/(login|setup|$)/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-AO");
    await expect(page.getByRole("button", { name: /Idioma: Português \(Angola\)/ })).toBeVisible();
  });

  test("a saved choice wins afterwards", async () => {
    await page.getByRole("button", { name: /Idioma/ }).click();
    await page.getByRole("menuitem", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await app.close();
    ({ app, page } = await launch(userData, {}, null));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
