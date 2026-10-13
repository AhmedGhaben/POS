import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 7 in the app: company data from the Angola
 * lists, a bank account (with "Outro"), tax rates, the store's IVA regime
 * and the app in Portuguese (Angola). Leaves the demo data as it found it.
 */
async function api<T>(page: Page, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
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

async function setLanguage(page: Page, language: string) {
  await page.evaluate(async (language) => {
    const auth = JSON.parse(localStorage.getItem("pos-auth")!);
    await fetch("/api/users/me/language", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${auth.state.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    auth.state.user.language = language;
    localStorage.setItem("pos-auth", JSON.stringify(auth));
  }, language);
  await page.reload();
}

test.describe.serial("Angola phase 7: company data and country config", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let before: { legalForm: string | null; province: string | null };

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    before = await api(page, "/businesses/me");
  });

  test.afterAll(async () => {
    await api(page, "/businesses/me", { method: "PATCH", body: { legalForm: before.legalForm ?? "", province: before.province ?? "" } }).catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("company data: legal form and province from the Angola lists", async () => {
    await page.goto("app://pos/settings");
    const legalForm = page.getByRole("combobox", { name: "Legal form" });
    await legalForm.click();
    await page.getByPlaceholder("Type to search...").fill("quotas");
    await page.getByRole("option", { name: "Sociedade por quotas (Lda)" }).click();
    const province = page.getByRole("combobox", { name: "Province" });
    await province.click();
    await page.getByPlaceholder("Type to search...").fill("huila");
    await page.getByRole("option", { name: "Huíla" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect.poll(async () => (await api<{ legalForm: string; province: string }>(page, "/businesses/me")).legalForm).toBe("LDA");
    expect((await api<{ province: string }>(page, "/businesses/me")).province).toBe("HA");
  });

  test("a bank account with a bank that isn't listed (Outro)", async () => {
    await page.getByRole("button", { name: "Add a bank account" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Bank" }).click();
    await page.getByPlaceholder("Type to search...").fill("Banco Yetu");
    await page.getByRole("option", { name: /Other: .Banco Yetu./ }).click();
    await dialog.getByLabel("Account holder").fill("Demo Retail Lda");
    await dialog.getByLabel("IBAN").fill("AO03 0006 0000 0012 3456 7890 1");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "Banco Yetu" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "AO03 0006 0000 0012 3456 7890 1" })).toBeVisible();

    // And remove it again.
    await page.getByRole("row", { name: /Banco Yetu/ }).getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name: "Banco Yetu" })).toHaveCount(0);
  });

  test("tax rates show Angola's, with the 7% flagged to check", async () => {
    await expect(page.getByRole("row", { name: /Taxa geral.*14%/ })).toContainText("Default");
    await expect(page.getByRole("row", { name: /Taxa intermédia/ })).toContainText("Check it still applies");
    await expect(page.getByRole("row", { name: /Taxa de Cabinda/ })).toContainText("Cabinda");
  });

  test("changing the store's IVA regime warns that it's logged", async () => {
    await page.getByRole("row", { name: /Main Street Store/ }).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "IVA regime" }).click();
    await page.getByRole("option", { name: /Regime de Exclusão/ }).click();
    await expect(dialog).toContainText("M04");
    await expect(dialog).toContainText("recorded with your name");
    // Not saved: the demo store stays in Regime Geral.
    await page.keyboard.press("Escape");
  });

  test("the app in Portuguese (Angola) uses the Angolan spelling", async () => {
    const original = await page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.user.language as string | null);
    await setLanguage(page, "pt-AO");
    await page.goto("app://pos/invoices");
    await expect(page.getByRole("link", { name: "Facturas" })).toBeVisible();
    await setLanguage(page, original ?? "en");
  });
});
