import fs from "fs";
import os from "os";
import path from "path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 8b in the app: Reports in the menu, the
 * SAF-T (AO) invoicing file for a month (dates exactly as chosen), the
 * inventory file and the accountant's Excel workbook, saved as named by the
 * server. Puts the demo business's NIF back as it found it.
 */
async function patchBusiness(page: Page, body: object): Promise<{ taxId: string | null }> {
  return page.evaluate(async (body) => {
    const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
    const res = await fetch("/api/businesses/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }, body);
}

/** Last month by Luanda's clock, as the page defaults to it. */
function lastMonthInLuanda(): { start: string; end: string } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda" }).format(new Date());
  const [y, m] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 2, 1));
  const last = new Date(Date.UTC(y, m - 1, 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

test.describe.serial("Angola phase 8b: SAF-T files and the accountant export", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "pos-saft-"));
  let app: ElectronApplication;
  let page: Page;
  let originalTaxId: string | null = null;

  const saved = async (fileName: string) => {
    const file = path.join(downloads, fileName);
    await expect.poll(() => fs.existsSync(file) && fs.statSync(file).size > 0).toBe(true);
    return fs.readFileSync(file);
  };

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    originalTaxId = (await patchBusiness(page, {})).taxId;
    await patchBusiness(page, { taxId: "" });
    // Save downloads straight into a folder instead of asking where.
    await app.evaluate(({ session }, dir) => {
      session.defaultSession.on("will-download", (_event, item) => item.setSavePath(`${dir}\\${item.getFilename()}`));
    }, downloads);
  });

  test.afterAll(async () => {
    await patchBusiness(page, { taxId: originalTaxId ?? "" }).catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("Reports is in the menu; without the company's NIF the file is refused with why", async () => {
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    // Since phase 10 Reports opens on the figures.
    await page.getByRole("tab", { name: "Files for AGT and the accountant" }).click();
    await page.getByRole("button", { name: "Generate file" }).click();
    await expect(page.getByText(/Add the company's NIF/)).toBeVisible();
    await patchBusiness(page, { taxId: "5417000000" });
  });

  test("the invoicing file for September 2026 covers 1 to 30 September exactly", async () => {
    await page.locator("#saft-month").fill("2026-09");
    await page.getByRole("button", { name: "Generate file" }).click();
    const name = "SAFT-AO_5417000000_2026-09-01_2026-09-30.xml";
    await expect(page.getByText(`${name} downloaded`)).toBeVisible();
    const xml = (await saved(name)).toString("utf8");
    expect(xml).toContain("<StartDate>2026-09-01</StartDate>");
    expect(xml).toContain("<EndDate>2026-09-30</EndDate>");
    expect(xml).toContain("<TaxRegistrationNumber>5417000000</TaxRegistrationNumber>");
  });

  test("a custom period ending on New Year's Eve keeps 31 December", async () => {
    await page.getByRole("combobox", { name: "Period" }).first().click();
    await page.getByRole("option", { name: "From… to…" }).click();
    await page.locator("#saft-start").fill("2025-12-01");
    await page.locator("#saft-end").fill("2025-12-31");
    await page.getByRole("button", { name: "Generate file" }).click();
    const name = "SAFT-AO_5417000000_2025-12-01_2025-12-31.xml";
    await expect(page.getByText(`${name} downloaded`)).toBeVisible();
    const xml = (await saved(name)).toString("utf8");
    expect(xml).toContain("<FiscalYear>2025</FiscalYear>");
    expect(xml).toContain("<EndDate>2025-12-31</EndDate>");
  });

  test("the inventory file at last 31 December", async () => {
    await page.getByRole("combobox", { name: "File" }).click();
    await page.getByRole("option", { name: /Inventory/ }).click();
    // Shown as the store writes dates (DD/MM/YYYY in Angola); the file name keeps ISO.
    const shown = await page.locator("#inventory-date").inputValue();
    expect(shown).toMatch(/^31\/12\/\d{4}$/);
    const date = `${shown.slice(6)}-12-31`;
    await page.getByRole("button", { name: "Generate file" }).click();
    const name = `SAFT-AO-Inventario_5417000000_${date}.csv`;
    await expect(page.getByText(`${name} downloaded`)).toBeVisible();
    expect((await saved(name)).toString("utf8")).toMatch(/^ProductCategory;ProductCode;/);
  });

  test("the accountant's Excel workbook for last month", async () => {
    await page.getByRole("button", { name: "Generate Excel file" }).click();
    const { start, end } = lastMonthInLuanda();
    const name = `Contabilidade_${start}_${end}.xlsx`;
    await expect(page.getByText(`${name} downloaded`)).toBeVisible();
    expect((await saved(name)).subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
