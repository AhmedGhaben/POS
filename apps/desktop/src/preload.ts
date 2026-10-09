import { contextBridge, ipcRenderer } from "electron";

interface Terminal {
  id: string;
  name: string;
  code: string;
  storeId: string;
}

interface ReceiptPrinter {
  deviceName: string | null;
  paperWidthMm: number;
  printableWidthMm: number;
  marginLeftMm: number;
  fontScale: number;
  feedMm: number;
  copies: number;
}

interface Printing {
  receipt: ReceiptPrinter;
  a4: { deviceName: string | null; copies: number };
  autoPrintReceipt: boolean;
  cutAfterReceipt: boolean;
}

interface PrintJob {
  kind: "receipt" | "a4";
  html: string;
  stylesheets: string[];
  copies?: number;
}

interface Drawer {
  connection: "none" | "receipt-printer" | "windows-printer" | "network" | "serial";
  printerName: string | null;
  host: string | null;
  port: number;
  comPort: string | null;
  baudRate: number;
  pin: 2 | 5;
  pulseMs: number;
  openOnCashSale: boolean;
}

type HardwareResult = { ok: true } | { ok: false; error: string };

interface Settings {
  serverUrl: string | null;
  kiosk: boolean;
  startWithWindows: boolean;
}

/**
 * The only bridge between the page and the desktop layer. Each operation is
 * a named, typed function; `ipcRenderer` itself is never exposed, and the
 * main process validates every argument again. Mirrored as `PosDesktopApi`
 * in apps/web/src/features/desktop/bridge.ts.
 */
const posDesktop = {
  app: {
    info: (): Promise<{ version: string; platform: string; logFile: string }> => ipcRenderer.invoke("app:info"),
    openLogFolder: (): Promise<void> => ipcRenderer.invoke("app:open-log-folder"),
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
    update: (patch: Partial<Pick<Settings, "kiosk" | "startWithWindows">>): Promise<Settings> =>
      ipcRenderer.invoke("settings:update", patch),
    setServer: (url: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke("settings:set-server", url),
  },
  terminal: {
    get: (): Promise<Terminal | null> => ipcRenderer.invoke("terminal:get"),
    set: (terminal: Terminal | null): Promise<void> => ipcRenderer.invoke("terminal:set", terminal),
  },
  printers: {
    list: (): Promise<{ name: string; displayName: string; isDefault: boolean; description: string }[]> =>
      ipcRenderer.invoke("printers:list"),
    print: (job: PrintJob): Promise<{ ok: true; deviceName: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke("printers:print", job),
  },
  printing: {
    get: (): Promise<Printing> => ipcRenderer.invoke("printing:get"),
    update: (printing: Printing): Promise<Printing> => ipcRenderer.invoke("printing:update", printing),
  },
  drawer: {
    get: (): Promise<Drawer> => ipcRenderer.invoke("drawer:get"),
    update: (drawer: Drawer): Promise<Drawer> => ipcRenderer.invoke("drawer:update", drawer),
    open: (): Promise<HardwareResult> => ipcRenderer.invoke("drawer:open"),
  },
  hardware: {
    comPorts: (): Promise<string[]> => ipcRenderer.invoke("hardware:com-ports"),
  },
  log: {
    write: (level: "info" | "warn" | "error", message: string): void => {
      void ipcRenderer.invoke("log:write", level, String(message).slice(0, 2000)).catch(() => {});
    },
  },
};

contextBridge.exposeInMainWorld("posDesktop", posDesktop);
