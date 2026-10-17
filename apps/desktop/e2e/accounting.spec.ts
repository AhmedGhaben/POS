import fs from "fs";
import os from "os";
import path from "path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { API_URL, connect, launch, login, openPosWithProducts, sellFirstProduct, SwitchableProxy, tempUserData } from "./helpers";
import { pdfText } from "./pdf-text";

/**
 * Contabilidade in the Windows app (docs/ACCOUNTING-DECISIONS.md): switch
 * it on, the PGC chart, a manual entry that must balance, the automatic
 * posting of a sale made at this till, a report and the SAF-T check.
 */
test.describe.serial("Accounting (Contabilidade)", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "pos-archive-"));
  let app: ElectronApplication;
  let page: Page;

  /** Picks an option in one of the app's comboboxes, typing to narrow the list. */
  async function choose(name: string | RegExp, search: string, option: string | RegExp) {
    await page.getByRole("combobox", { name }).click();
    await page.getByPlaceholder("Type to search...").fill(search);
    await page.getByRole("option", { name: option }).first().click();
  }

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    // Save downloads straight into a folder instead of asking where.
    await app.evaluate(({ session }, dir) => {
      session.defaultSession.on("will-download", (_event, item) => item.setSavePath(`${dir}\\${item.getFilename()}`));
    }, downloads);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("the owner switches accounting on (once) and gets the PGC chart, with an account for this till", async () => {
    await page.goto("app://pos/accounting");
    await expect(page.getByRole("heading", { name: "Accounting" })).toBeVisible();
    const enable = page.getByRole("button", { name: "Switch accounting on" });
    if (await enable.isVisible().catch(() => false)) await enable.click();
    await page.getByRole("tab", { name: "Chart of accounts" }).click();
    await expect(page.getByText(/to be validated by an accountant/)).toBeVisible();
    await page.getByPlaceholder("Search code or name").fill("45.1");
    await expect(page.getByRole("cell", { name: "Caixa principal" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /^Caixa POS-\d+/ }).first()).toBeVisible();
  });

  test("a manual entry can only be posted once it balances", async () => {
    await page.getByRole("tab", { name: "Entries" }).click();
    await page.getByRole("button", { name: "New entry" }).click();
    const dialog = page.getByRole("dialog");
    await choose("Journal", "OPD", /^OPD/);
    await dialog.getByLabel("Description", { exact: true }).fill("Material de limpeza (teste)");
    await choose("Account, line 1", "75.2.9", /^75\.2\.9 /);
    await dialog.getByLabel("Debit, line 1").fill("1500");
    await choose("Account, line 2", "45.1.1", /^45\.1\.1 /);
    await dialog.getByLabel("Credit, line 2").fill("1400");
    const post = dialog.getByRole("button", { name: "Post entry" });
    await expect(post).toBeDisabled();
    await expect(dialog.getByRole("status")).toContainText("Difference");
    await dialog.getByLabel("Credit, line 2").fill("1500");
    await expect(dialog.getByRole("status")).toHaveText("Balanced");
    await post.click();
    await expect(page.getByText(/^Entry \d{4}-\d{2}-\d{2} OPD \d{4}\/\d+ posted$/)).toBeVisible();
    await expect(page.getByRole("cell", { name: /Material de limpeza \(teste\)/ }).first()).toBeVisible();
  });

  test("a sale at this till is posted by 'Post now' and shows up as an automatic entry", async () => {
    await openPosWithProducts(page);
    await sellFirstProduct(page);
    await page.goto("app://pos/accounting?tab=integration");
    await page.getByRole("button", { name: "Post now" }).click();
    await expect(page.getByText(/\d+ posted, \d+ skipped, \d+ with errors/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("pending-FISCAL_DOCUMENT")).toHaveText("0");
    await page.getByRole("tab", { name: "Entries" }).click();
    await expect(page.getByText("From the POS").first()).toBeVisible();
  });

  test("the trial balance shows, with debits equal to credits; the SAF-T check says what's missing", async () => {
    await page.getByRole("tab", { name: "Reports" }).click();
    await page.getByRole("button", { name: "Show" }).click();
    const report = page.getByTestId("accounting-report");
    await expect(report.getByRole("columnheader", { name: "Debit balance" })).toBeVisible();
    const totals = report.locator("tfoot td");
    // Columns: code, name, then debit/credit pairs: the balances' totals are equal.
    await expect(totals.nth(8)).toHaveText((await totals.nth(9).textContent()) ?? "");
    await page.getByRole("tab", { name: "SAF-T" }).click();
    await page.getByLabel("Draft (periods still open)").check();
    await page.getByRole("button", { name: "Check the books" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Ready|Periods still open|NIF|records of the year/ })).toBeVisible({ timeout: 120_000 });
  });

  test("Phase B screens: banks, fixed assets (depreciation for a month), the archive, and the owner's accountants", async () => {
    await page.goto("app://pos/accounting?tab=bank");
    await expect(page.getByText("Import a bank statement")).toBeVisible();
    await page.getByRole("tab", { name: "Fixed assets" }).click();
    await page.getByRole("button", { name: "Post the month's depreciation" }).click();
    await expect(page.getByText(/assets depreciated|Nothing to depreciate/)).toBeVisible();
    await page.getByRole("tab", { name: "SAF-T" }).click();
    await expect(page.getByRole("button", { name: "Download the archive (ZIP)" })).toBeVisible();
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByText("Give your accountant access to the books", { exact: false })).toBeVisible();
  });

  test("the document archive: every document as a PDF in its printed layout (2ª Via), with the SAF-T files and the index", async () => {
    test.setTimeout(300_000);
    await page.goto("app://pos/accounting?tab=saft");
    // Today only (the sale above is in it), to keep the run short.
    await page.getByLabel("From", { exact: true }).fill(await page.getByLabel("To", { exact: true }).inputValue());
    const started = Date.now();
    await page.getByRole("button", { name: "Download the archive (ZIP)" }).click();
    await expect(page.getByText(/^Making the PDFs: \d+ of \d+$/)).toBeVisible();
    await expect(page.getByText(/^Archive saved: \d+ documents$/)).toBeVisible({ timeout: 280_000 });
    await expect.poll(() => fs.readdirSync(downloads).some((f) => /^Arquivo_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.zip$/.test(f))).toBe(true);
    const name = fs.readdirSync(downloads).find((f) => f.startsWith("Arquivo_"))!;
    await expect.poll(() => fs.statSync(path.join(downloads, name)).size).toBeGreaterThan(0);
    const files = unzipSync(fs.readFileSync(path.join(downloads, name)));

    // Every document the index lists is in the ZIP, as a PDF.
    const rows = strFromU8(files["indice.csv"]).split("\r\n").filter((r) => r.startsWith("documentos/"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(strFromU8(files[row.split(";")[0]].subarray(0, 5))).toBe("%PDF-");
    test.info().annotations.push({ type: "archive", description: `${rows.length} documents in ${Math.round((Date.now() - started) / 1000)} s` });

    // A Factura-Recibo reads as the printed one, marked 2ª Via: real text, not a picture of it.
    const fr = rows.find((r) => r.startsWith("documentos/FR/"))!;
    const [file, , documentNo] = fr.split(";");
    const pdf = pdfText(Buffer.from(files[file]));
    expect(pdf.pages).toBe(1);
    expect(pdf.fonts).toBeGreaterThan(0);
    const text = pdf.text.replace(/\s+/g, "");
    for (const expected of ["2ªVia", documentNo.replace(/\s+/g, ""), "Factura-Recibo", "NIF", "Total"]) expect(text).toContain(expected);
    expect(Object.keys(files).some((n) => /^saft\/SAFT-AO_.*\.xml$/.test(n))).toBe(true);
  });
});
