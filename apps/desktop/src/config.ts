import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const terminalSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  code: z.string().min(1).max(20),
  storeId: z.string().min(1).max(64),
});

/** Calibration for the roll printer: drivers that all say "80 mm" differ. */
export const receiptPrinterSchema = z.object({
  deviceName: z.string().min(1).max(256).nullable(),
  /** 58, 80, or anything in between for odd rolls. */
  paperWidthMm: z.number().min(40).max(120),
  printableWidthMm: z.number().min(30).max(120),
  marginLeftMm: z.number().min(0).max(20),
  /** 1 = as designed; below 1 shrinks text for narrow rolls. */
  fontScale: z.number().min(0.5).max(1.5),
  /** Blank paper after the last line, so the tear/cut is below the footer. */
  feedMm: z.number().min(0).max(40),
  copies: z.number().int().min(1).max(5),
});

export const a4PrinterSchema = z.object({
  deviceName: z.string().min(1).max(256).nullable(),
  copies: z.number().int().min(1).max(5),
});

export const printingSchema = z.object({
  receipt: receiptPrinterSchema,
  a4: a4PrinterSchema,
  /** Print the receipt as soon as a sale completes. */
  autoPrintReceipt: z.boolean(),
  /** Send an ESC/POS cut after each receipt (for drivers that don't cut). */
  cutAfterReceipt: z.boolean().default(false),
});

export type PrintingSettings = z.infer<typeof printingSchema>;

export const DEFAULT_PRINTING: PrintingSettings = {
  receipt: {
    deviceName: null,
    paperWidthMm: 80,
    printableWidthMm: 72,
    marginLeftMm: 0,
    fontScale: 1,
    feedMm: 10,
    copies: 1,
  },
  a4: { deviceName: null, copies: 1 },
  autoPrintReceipt: false,
  cutAfterReceipt: false,
};

/**
 * Cash drawer. Most drawers plug into the receipt printer and open when it
 * gets the ESC/POS kick; some sit on their own COM port.
 */
export const drawerSchema = z.object({
  connection: z.enum(["none", "receipt-printer", "windows-printer", "network", "serial"]),
  /** For "windows-printer": a printer other than the receipt printer. */
  printerName: z.string().min(1).max(256).nullable(),
  host: z
    .string()
    .max(253)
    .regex(/^[A-Za-z0-9.-]+$/, "Host name or IP address")
    .nullable(),
  port: z.number().int().min(1).max(65535),
  comPort: z.string().regex(/^COM\d{1,3}$/i).nullable(),
  baudRate: z.union([z.literal(2400), z.literal(4800), z.literal(9600), z.literal(19200), z.literal(38400), z.literal(57600), z.literal(115200)]),
  pin: z.union([z.literal(2), z.literal(5)]),
  pulseMs: z.number().int().min(50).max(500),
  openOnCashSale: z.boolean(),
});

export type DrawerSettings = z.infer<typeof drawerSchema>;

export const DEFAULT_DRAWER: DrawerSettings = {
  connection: "none",
  printerName: null,
  host: null,
  port: 9100,
  comPort: null,
  baudRate: 9600,
  pin: 2,
  pulseMs: 100,
  openOnCashSale: true,
};

/** Per-computer settings, kept in the app's data folder (never synced). */
const configSchema = z.object({
  /** API base URL, e.g. http://localhost:4000 or https://pos.example.com/api */
  serverUrl: z.string().url().optional().catch(undefined),
  /** This till, once registered with the server. */
  terminal: terminalSchema.nullable().optional().catch(undefined),
  /** Fullscreen till mode with no window frame. */
  kiosk: z.boolean().optional().catch(undefined),
  startWithWindows: z.boolean().optional().catch(undefined),
  printing: printingSchema.optional().catch(undefined),
  drawer: drawerSchema.optional().catch(undefined),
});
// Each field falls back on its own (.catch), so one bad value in a
// hand-edited or older config.json can't wipe the server address.

export type DesktopConfig = z.infer<typeof configSchema>;

/** What the page may change through `settings.update`. */
export const settingsPatchSchema = z
  .object({
    kiosk: z.boolean(),
    startWithWindows: z.boolean(),
  })
  .partial()
  .strict();

let cached: DesktopConfig | null = null;

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

export function getConfig(): DesktopConfig {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    const parsed = configSchema.safeParse(raw);
    cached = parsed.success ? parsed.data : {};
  } catch {
    cached = {};
  }
  return cached;
}

export function getPrinting(): PrintingSettings {
  return getConfig().printing ?? DEFAULT_PRINTING;
}

export function getDrawer(): DrawerSettings {
  return getConfig().drawer ?? DEFAULT_DRAWER;
}

export function updateConfig(patch: Partial<DesktopConfig>): DesktopConfig {
  const next = configSchema.parse({ ...getConfig(), ...patch });
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  // Write-then-rename so a crash mid-write can't leave a half-written file.
  const tmp = `${configPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, configPath());
  cached = next;
  return next;
}

/** Normalizes what the user typed into an API base URL without a trailing slash. */
export function normalizeServerUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server address must start with http:// or https://");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}
