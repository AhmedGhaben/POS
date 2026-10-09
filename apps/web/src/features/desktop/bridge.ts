import { create } from "zustand";

/** The till's identity as stored on this computer by the desktop app. */
export interface DesktopTerminal {
  id: string;
  name: string;
  code: string;
  storeId: string;
}

export interface DesktopAppInfo {
  version: string;
  platform: string;
  logFile: string;
}

export interface ReceiptPrinterSettings {
  deviceName: string | null;
  paperWidthMm: number;
  printableWidthMm: number;
  marginLeftMm: number;
  fontScale: number;
  feedMm: number;
  copies: number;
}

export interface PrintingSettings {
  receipt: ReceiptPrinterSettings;
  a4: { deviceName: string | null; copies: number };
  autoPrintReceipt: boolean;
}

export interface DesktopPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
  description: string;
}

export interface DesktopPrintJob {
  kind: "receipt" | "a4";
  html: string;
  stylesheets: string[];
  copies?: number;
}

export type DesktopPrintResult = { ok: true; deviceName: string } | { ok: false; error: string };

export interface DesktopSettings {
  serverUrl: string | null;
  kiosk: boolean;
  startWithWindows: boolean;
}

/**
 * What the Windows app's preload exposes (apps/desktop/src/preload.ts).
 * Absent in a normal browser, where every desktop feature switches off.
 */
export interface PosDesktopApi {
  app: {
    info(): Promise<DesktopAppInfo>;
    openLogFolder(): Promise<void>;
  };
  settings: {
    get(): Promise<DesktopSettings>;
    update(patch: Partial<Pick<DesktopSettings, "kiosk" | "startWithWindows">>): Promise<DesktopSettings>;
    setServer(url: string): Promise<{ ok: true } | { ok: false; error: string }>;
  };
  terminal: {
    get(): Promise<DesktopTerminal | null>;
    set(terminal: DesktopTerminal | null): Promise<void>;
  };
  printers: {
    list(): Promise<DesktopPrinter[]>;
    print(job: DesktopPrintJob): Promise<DesktopPrintResult>;
  };
  printing: {
    get(): Promise<PrintingSettings>;
    update(settings: PrintingSettings): Promise<PrintingSettings>;
  };
  log: {
    write(level: "info" | "warn" | "error", message: string): void;
  };
}

declare global {
  interface Window {
    posDesktop?: PosDesktopApi;
  }
}

export const desktop: PosDesktopApi | null = typeof window !== "undefined" ? (window.posDesktop ?? null) : null;

export const isDesktop = desktop !== null;

/** Best-effort line in the desktop app's log file (no-op in the browser). */
export function desktopLog(level: "info" | "warn" | "error", message: string) {
  try {
    desktop?.log.write(level, message);
  } catch {
    // logging must never break the till
  }
}

interface DeviceState {
  terminal: DesktopTerminal | null;
  /** Null in the browser, where printing goes through the print dialog. */
  printing: PrintingSettings | null;
  loaded: boolean;
  load: () => Promise<void>;
  setTerminal: (terminal: DesktopTerminal | null) => Promise<void>;
  setPrinting: (printing: PrintingSettings) => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  terminal: null,
  printing: null,
  loaded: !isDesktop,
  load: async () => {
    if (!desktop) return;
    const [terminal, printing] = await Promise.all([desktop.terminal.get(), desktop.printing.get()]);
    set({ terminal, printing, loaded: true });
  },
  setTerminal: async (terminal) => {
    await desktop?.terminal.set(terminal);
    set({ terminal });
  },
  setPrinting: async (printing) => {
    if (!desktop) return;
    set({ printing: await desktop.printing.update(printing) });
  },
}));
