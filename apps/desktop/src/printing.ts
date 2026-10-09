import { BrowserWindow, type WebContentsPrintOptions } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getPrinting, type PrintingSettings } from "./config";
import { cutReceiptPaper } from "./hardware/drawer";
import { log } from "./logging";
import { APP_ORIGIN } from "./origin";

/**
 * Silent printing. The page sends the already-rendered document (the
 * <PrintArea> markup plus the app's stylesheet links); it's loaded into a
 * hidden window of its own and printed from there, so the POS screen's
 * size, scroll position, dialogs and animations can't affect the printout.
 */

export const printJobSchema = z.object({
  kind: z.enum(["receipt", "a4"]),
  /** Inner HTML of #print-root. */
  html: z.string().min(1).max(2_000_000),
  /** The app's own stylesheets (app://pos/assets/*.css). */
  stylesheets: z.array(z.string().startsWith(`${APP_ORIGIN}/`).max(500)).max(10),
  /** Override the configured copies (e.g. test pages print once). */
  copies: z.number().int().min(1).max(5).optional(),
});

export type PrintJob = z.infer<typeof printJobSchema>;
export type PrintResult = { ok: true; deviceName: string } | { ok: false; error: string };

const MICRONS_PER_MM = 1000;
const PX_PER_MM = 96 / 25.4;
/** Chromium needs a page at least this tall (microns). */
const MIN_PAGE_HEIGHT_UM = 50_000;

/** Pages waiting to be served to the print window, by one-time id. */
const pending = new Map<string, string>();

/** Served by the app:// handler at /__print/<id>; each page is served once. */
export function takePrintPage(id: string): string | undefined {
  const html = pending.get(id);
  pending.delete(id);
  return html;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The standalone document the print window loads. No scripts. */
export function buildPrintPage(job: PrintJob, settings: PrintingSettings): string {
  const r = settings.receipt;
  const vars =
    job.kind === "receipt"
      ? `--receipt-width:${r.printableWidthMm}mm;--receipt-margin-left:${r.marginLeftMm}mm;` +
        `--receipt-feed:${r.feedMm}mm;--receipt-scale:${r.fontScale};`
      : "";
  const links = job.stylesheets.map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`).join("");
  return (
    `<!doctype html><html class="print-doc"><head><meta charset="utf-8">${links}` +
    `<style>:root{${vars}}html,body{margin:0;padding:0;background:#fff}</style>` +
    `</head><body><div id="print-root" data-format="${job.kind}">${job.html}</div></body></html>`
  );
}

let printWindow: BrowserWindow | null = null;

function getPrintWindow(): BrowserWindow {
  if (printWindow && !printWindow.isDestroyed()) return printWindow;
  printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // No preload: this window never talks to the desktop bridge.
    },
  });
  printWindow.on("closed", () => {
    printWindow = null;
  });
  return printWindow;
}

/** Waits for fonts and images (a logo that can't load offline is skipped). */
const SETTLE_SCRIPT = `
  Promise.race([
    Promise.all([
      document.fonts.ready,
      ...Array.from(document.images).map((img) =>
        img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve; })),
    ]),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]).then(() => Math.ceil(document.getElementById("print-root").getBoundingClientRect().height))
`;

function printOptions(job: PrintJob, settings: PrintingSettings, contentHeightPx: number): WebContentsPrintOptions {
  if (job.kind === "a4") {
    return {
      silent: true,
      deviceName: settings.a4.deviceName!,
      copies: job.copies ?? settings.a4.copies,
      printBackground: true,
      pageSize: "A4",
      // 15 mm, matching @page a4 in the web app's print CSS.
      margins: { marginType: "custom", top: 57, bottom: 57, left: 57, right: 57 },
    };
  }
  const r = settings.receipt;
  // One continuous page as long as the receipt: no page breaks mid-receipt,
  // and no blank paper fed after it beyond the configured feed.
  const heightUm = Math.max(MIN_PAGE_HEIGHT_UM, Math.ceil((contentHeightPx / PX_PER_MM) * MICRONS_PER_MM));
  return {
    silent: true,
    deviceName: r.deviceName!,
    copies: job.copies ?? r.copies,
    printBackground: true,
    pageSize: { width: Math.round(r.paperWidthMm * MICRONS_PER_MM), height: heightUm },
    margins: { marginType: "none" },
  };
}

async function runJob(job: PrintJob): Promise<PrintResult> {
  const settings = getPrinting();
  const deviceName = job.kind === "a4" ? settings.a4.deviceName : settings.receipt.deviceName;
  if (!deviceName) {
    return { ok: false, error: `No ${job.kind === "a4" ? "A4" : "receipt"} printer is set up on this till` };
  }

  const win = getPrintWindow();
  const installed = await win.webContents.getPrintersAsync();
  if (!installed.some((p) => p.name === deviceName)) {
    return { ok: false, error: `Printer "${deviceName}" not found. Is it switched on and connected?` };
  }

  const id = randomUUID();
  pending.set(id, buildPrintPage(job, settings));
  try {
    await win.loadURL(`${APP_ORIGIN}/__print/${id}`);
    const heightPx = Number(await win.webContents.executeJavaScript(SETTLE_SCRIPT, true)) || 0;
    const options = printOptions(job, settings, heightPx);
    const pdfDir = process.env.POS_DESKTOP_PRINT_TO_PDF_DIR;
    if (pdfDir) return await printToPdfForTests(win, job, options, pdfDir);
    const result = await new Promise<PrintResult>((resolve) => {
      win.webContents.print(options, (success, failureReason) => {
        resolve(success ? { ok: true, deviceName } : { ok: false, error: failureReason || "Printing failed" });
      });
    });
    // Drivers that don't cut on their own get an ESC/POS cut after the slip.
    // The spooler keeps jobs in order, so it lands after the receipt.
    if (result.ok && job.kind === "receipt" && settings.cutAfterReceipt) {
      await cutReceiptPaper(deviceName);
    }
    return result;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    pending.delete(id);
  }
}

/**
 * Tests only (POS_DESKTOP_PRINT_TO_PDF_DIR): renders the job with the same
 * page size and margins to a PDF instead of a printer, so layout can be
 * checked on a machine without a receipt printer.
 */
async function printToPdfForTests(
  win: BrowserWindow,
  job: PrintJob,
  options: WebContentsPrintOptions,
  dir: string,
): Promise<PrintResult> {
  const UM_PER_INCH = 25_400;
  const size = options.pageSize;
  const margins = options.margins;
  const pxToIn = (px?: number) => (px ?? 0) / 96;
  const data = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: typeof size === "object" ? { width: size.width / UM_PER_INCH, height: size.height / UM_PER_INCH } : (size as "A4"),
    margins:
      margins?.marginType === "custom"
        ? { top: pxToIn(margins.top), bottom: pxToIn(margins.bottom), left: pxToIn(margins.left), right: pxToIn(margins.right) }
        : { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${job.kind}-${options.copies}x-${(options.deviceName ?? "").replace(/[^a-z0-9]+/gi, "_")}.pdf`);
  await fs.writeFile(file, data);
  return { ok: true, deviceName: options.deviceName! };
}

let queue: Promise<unknown> = Promise.resolve();

/** Prints one job at a time; the sale never waits on the printer. */
export function printJob(job: PrintJob): Promise<PrintResult> {
  const result = queue.then(async () => {
    const started = Date.now();
    const res = await runJob(job);
    if (res.ok) {
      log.info(`[print] ${job.kind} → "${res.deviceName}" ok (${Date.now() - started} ms)`);
    } else {
      log.warn(`[print] ${job.kind} failed: ${res.error}`);
    }
    return res;
  });
  queue = result.catch(() => undefined);
  return result;
}

export async function listPrinters() {
  const win = getPrintWindow();
  const printers = await win.webContents.getPrintersAsync();
  log.info(`[print] found ${printers.length} printer(s)`);
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: !!(p as { isDefault?: boolean }).isDefault,
    description: p.description ?? "",
  }));
}

export function closePrintWindow() {
  if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
  printWindow = null;
}
