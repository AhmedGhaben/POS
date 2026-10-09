import fs from "node:fs";
import path from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  launch,
  restock,
  login,
  openPosWithProducts,
  sellFirstProduct,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * Part B, silent printing (docs/plans/DESKTOP_APP.md). With
 * POS_DESKTOP_PRINT_TO_PDF_DIR set, every job is rendered to a PDF with the
 * exact page size the printer would get, so page widths, lengths and page
 * counts can be checked here. The real printer path is covered by the
 * "printer missing" case and by the hardware checklist.
 */
const PT_PER_MM = 72 / 25.4;

interface PdfInfo {
  file: string;
  widthMm: number;
  heightMm: number;
  pages: number;
}

function readPdf(file: string): PdfInfo {
  const text = fs.readFileSync(file, "latin1");
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(text);
  if (!box) throw new Error(`no MediaBox in ${file}`);
  return {
    file: path.basename(file),
    widthMm: Number(box[1]) / PT_PER_MM,
    heightMm: Number(box[2]) / PT_PER_MM,
    pages: (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length,
  };
}

test.describe.serial("Part B: silent printing", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  const pdfDir = path.join(userData, "printed");
  let app: ElectronApplication;
  let page: Page;
  let printerName: string;
  let seen = new Set<string>();

  /** Waits for the next PDF the app "prints". */
  async function nextPrint(): Promise<PdfInfo> {
    let found: string | undefined;
    await expect
      .poll(
        () => {
          const files = fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).filter((f) => !seen.has(f)) : [];
          found = files.sort()[0];
          return found;
        },
        { timeout: 20_000 },
      )
      .toBeTruthy();
    seen.add(found!);
    return readPdf(path.join(pdfDir, found!));
  }

  async function choose(label: string, option: string | RegExp) {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option }).click();
  }

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData, { POS_DESKTOP_PRINT_TO_PDF_DIR: pdfDir }));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("the device page lists this computer's printers", async () => {
    await page.goto("app://pos/device");
    const printers = await page.evaluate(() =>
      (window as unknown as { posDesktop: { printers: { list(): Promise<{ name: string }[]> } } }).posDesktop.printers.list(),
    );
    expect(printers.length).toBeGreaterThan(0);
    printerName = printers[0].name;
    await expect(page.getByTestId("receipt-printer-status")).toHaveText("Not set");
    await choose("Receipt printer", new RegExp(`^${printerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    await expect(page.getByTestId("receipt-printer-status")).toHaveText("Available");
  });

  test("calibration receipt: 80 mm page, one continuous page", async () => {
    await page.getByRole("button", { name: "Print calibration receipt" }).click();
    const pdf = await nextPrint();
    expect(pdf.file).toContain("-receipt-1x-");
    expect(pdf.widthMm).toBeCloseTo(80, 0);
    expect(pdf.pages).toBe(1);
  });

  test("58 mm paper: page width follows, printable width defaults to 48 mm", async () => {
    await choose("Paper width", "58 mm");
    await expect(page.getByLabel("Printable width (mm)")).toHaveValue("48");
    await page.getByRole("button", { name: "Print calibration receipt" }).click();
    const pdf = await nextPrint();
    expect(pdf.widthMm).toBeCloseTo(58, 0);

    await choose("Paper width", "80 mm");
    await expect(page.getByLabel("Printable width (mm)")).toHaveValue("72");
  });

  test("A4 printer: test page prints on A4", async () => {
    await choose("A4 printer", new RegExp(`^${printerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    await page.getByRole("button", { name: "Print A4 test page" }).click();
    const pdf = await nextPrint();
    expect(pdf.file).toContain("-a4-");
    expect(pdf.widthMm).toBeCloseTo(210, 0);
    expect(pdf.heightMm).toBeCloseTo(297, 0);
  });

  test("auto-print: each sale prints its receipt with the configured copies", async () => {
    await page.getByLabel("Copies").first().fill("2");
    await page.getByLabel("Copies").first().press("Enter");
    await page.getByLabel("Print the receipt automatically after each sale").check();

    await openPosWithProducts(page);
    await sellFirstProduct(page);
    const pdf = await nextPrint();
    expect(pdf.file).toContain("-receipt-2x-");
    expect(pdf.widthMm).toBeCloseTo(80, 0);
    expect(pdf.pages).toBe(1);
  });

  test("a long receipt stays one continuous page and grows in length", async () => {
    const short = await (async () => {
      await sellFirstProduct(page);
      return nextPrint();
    })();

    // Many different products in one sale: every product of every category.
    const categories = page.getByRole("button", { name: "All", exact: true }).locator("xpath=following-sibling::button");
    const products = page.locator("div.grid > button.text-left");
    let lines = 0;
    for (let c = 0; c < (await categories.count()) && lines < 15; c++) {
      await categories.nth(c).click();
      await products.first().waitFor();
      for (let i = 0; i < (await products.count()) && lines < 15; i++, lines++) await products.nth(i).click();
    }
    expect(lines).toBeGreaterThanOrEqual(8);
    await page.getByRole("button", { name: /^Charge/ }).click();
    await page.getByRole("dialog").waitFor();
    const long = await nextPrint();
    await page.keyboard.press("Escape");

    expect(long.pages).toBe(1);
    expect(long.heightMm).toBeGreaterThan(short.heightMm + 20);
  });

  test("printing works with the server unreachable", async () => {
    await openPosWithProducts(page);
    await proxy.down();
    const receipt = await sellFirstProduct(page);
    expect(receipt).toContain("Saved offline");
    const pdf = await nextPrint();
    expect(pdf.file).toContain("-receipt-");
    await proxy.up();
  });

  test("a missing printer shows an error with Retry, and the sale still completes", async () => {
    await page.evaluate(async () => {
      const d = (window as unknown as {
        posDesktop: { printing: { get(): Promise<{ receipt: { deviceName: string | null } }>; update(s: unknown): Promise<unknown> } };
      }).posDesktop;
      const s = await d.printing.get();
      s.receipt.deviceName = "Unplugged Thermal Printer";
      await d.printing.update(s);
    });
    // Reload so the POS picks up the changed settings.
    await page.reload();
    await openPosWithProducts(page);
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    await expect(page.getByText(/Couldn't print: Printer "Unplugged Thermal Printer" not found/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("the log records print jobs", async () => {
    const text = fs.readFileSync(path.join(userData, "logs", "main.log"), "utf8");
    expect(text).toMatch(/\[print\] receipt → ".+" ok/);
    expect(text).toMatch(/\[print\] a4 → ".+" ok/);
    expect(text).toContain('[print] receipt failed: Printer "Unplugged Thermal Printer" not found');
  });

  test.afterAll(() => {
    seen = new Set();
  });
});
