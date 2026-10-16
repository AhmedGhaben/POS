import { create } from "zustand";

/** The till's identity as stored on this computer by the desktop app. */
export interface SigningStatus {
  hasKey: boolean;
  keyVersion: string | null;
  /** "0" until the software is certified. */
  hashControl: string | null;
  /** Windows data protection is available to keep the key. */
  secureStorage: boolean;
}

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
  /** ESC/POS cut after each receipt, for drivers that don't cut. */
  cutAfterReceipt: boolean;
}

export type DrawerConnection = "none" | "receipt-printer" | "windows-printer" | "network" | "serial";

export interface DrawerSettings {
  connection: DrawerConnection;
  printerName: string | null;
  host: string | null;
  port: number;
  comPort: string | null;
  baudRate: number;
  pin: 2 | 5;
  pulseMs: number;
  openOnCashSale: boolean;
}

export interface DisplaySettings {
  kind: "none" | "pole" | "monitor";
  pole: {
    connection: "serial" | "network";
    comPort: string | null;
    baudRate: number;
    host: string | null;
    port: number;
    commandSet: "epson" | "cd5220" | "plain";
  };
  monitor: { displayId: number | null };
  idleMessage: string;
}

export interface DesktopScreen {
  id: number;
  label: string;
  width: number;
  height: number;
  primary: boolean;
}

/** `code` is absent from Windows apps older than 0.2.1; show `reason`/`error` then. */
export type UpdateStatus =
  | { state: "disabled"; reason: string; code?: "dev-build" }
  | { state: "idle" | "checking" | "up-to-date"; checkedAt?: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; error: string; code?: "offline" | "damaged" | "none-published" | "other"; checkedAt?: string };

export type HardwareResult = { ok: true } | { ok: false; error: string };

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
  /** This print only: another printer than the till's (ignored by apps before 0.2.4). */
  deviceName?: string;
}

export type DesktopPrintResult = { ok: true; deviceName: string } | { ok: false; error: string };

export interface DesktopSettings {
  serverUrl: string | null;
  kiosk: boolean;
  startWithWindows: boolean;
  /** Absent before 0.2.3. */
  autoLockMinutes?: number;
}

/** Someone who can sign in on this till with a PIN. */
export interface TillStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: "OWNER" | "MANAGER" | "CASHIER";
}

export type PinSignInResult =
  | { ok: true; mode: "online"; session: unknown }
  | {
      ok: true;
      mode: "offline";
      user: TillStaffMember & { language?: string | null; displaySize?: number | null; permissions: Record<string, boolean> };
    }
  | { ok: false; code: "wrong" | "locked" | "no-access" | "unknown-user" | "not-registered"; error: string };

export type ApprovalCheckResult =
  | { ok: true }
  | { ok: false; code: "wrong" | "locked" | "no-access" | "unknown-user"; error: string };

export type PinResumeResult =
  | { ok: true; session: unknown }
  | { ok: false; code: "unreachable" | "rejected" | "nothing"; error?: string };

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
    update(patch: Partial<Pick<DesktopSettings, "kiosk" | "startWithWindows" | "autoLockMinutes">>): Promise<DesktopSettings>;
    setServer(url: string): Promise<{ ok: true } | { ok: false; error: string }>;
  };
  terminal: {
    get(): Promise<DesktopTerminal | null>;
    set(terminal: DesktopTerminal | null): Promise<void>;
    /** Absent before 0.2.3. */
    hasKey?(): Promise<boolean>;
  };
  /** Fiscal signing on the till (absent before 0.2.4): the key stays in the main process. */
  signing?: {
    status(): Promise<SigningStatus>;
    refresh(): Promise<SigningStatus & { ok: boolean }>;
    sign(message: string): Promise<{ hash: string; keyVersion: string }>;
  };
  /** PIN sign-in (absent before 0.2.3). */
  staff?: {
    list(): Promise<TillStaffMember[]>;
    refresh(): Promise<{ ok: boolean; count: number }>;
  };
  pin?: {
    signIn(userId: string, pin: string): Promise<PinSignInResult>;
    resume(userId: string): Promise<PinResumeResult>;
  };
  /** Offline manager override (absent before 0.2.4). */
  approval?: {
    approvers(permission: string, exceptUserId?: string): Promise<TillStaffMember[]>;
    check(userId: string, pin: string, permission: string): Promise<ApprovalCheckResult>;
  };
  printers: {
    list(): Promise<DesktopPrinter[]>;
    print(job: DesktopPrintJob): Promise<DesktopPrintResult>;
  };
  printing: {
    get(): Promise<PrintingSettings>;
    update(settings: PrintingSettings): Promise<PrintingSettings>;
  };
  drawer: {
    get(): Promise<DrawerSettings>;
    update(settings: DrawerSettings): Promise<DrawerSettings>;
    open(): Promise<HardwareResult>;
  };
  display: {
    get(): Promise<DisplaySettings>;
    update(settings: DisplaySettings): Promise<DisplaySettings>;
    /** Abstract state (see customer-display.ts); fire-and-forget. */
    show(state: unknown): void;
    test(): Promise<HardwareResult>;
    screens(): Promise<DesktopScreen[]>;
  };
  updates: {
    status(): Promise<UpdateStatus>;
    check(): Promise<UpdateStatus>;
    install(): Promise<boolean>;
    onStatus(callback: (status: UpdateStatus) => void): () => void;
  };
  hardware: {
    comPorts(): Promise<string[]>;
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
  /** This till has its key, so PIN sign-in can work. */
  hasKey: boolean;
  /** Who can sign in here with a PIN (saved on the till). */
  staff: TillStaffMember[];
  autoLockMinutes: number;
  /** Null in the browser, where printing goes through the print dialog. */
  printing: PrintingSettings | null;
  drawer: DrawerSettings | null;
  display: DisplaySettings | null;
  update: UpdateStatus | null;
  loaded: boolean;
  load: () => Promise<void>;
  setTerminal: (terminal: DesktopTerminal | null) => Promise<void>;
  setPrinting: (printing: PrintingSettings) => Promise<void>;
  setDrawer: (drawer: DrawerSettings) => Promise<void>;
  setDisplay: (display: DisplaySettings) => Promise<void>;
  /** Re-reads the key and the staff list, fetching a fresh list when online. */
  refreshTill: (fetch?: boolean) => Promise<void>;
  /** This till's signing key (it signs its own fiscal documents); null in a browser. */
  signing: SigningStatus | null;
  setAutoLockMinutes: (minutes: number) => Promise<void>;
}

let unsubscribeUpdates: (() => void) | null = null;

export const useDeviceStore = create<DeviceState>((set, get) => ({
  terminal: null,
  hasKey: false,
  signing: null,
  staff: [],
  autoLockMinutes: 0,
  printing: null,
  drawer: null,
  display: null,
  update: null,
  loaded: !isDesktop,
  load: async () => {
    if (!desktop) return;
    const [terminal, printing, drawer, display, update, settings] = await Promise.all([
      desktop.terminal.get(),
      desktop.printing.get(),
      desktop.drawer.get(),
      desktop.display.get(),
      desktop.updates.status(),
      desktop.settings.get(),
    ]);
    set({ terminal, printing, drawer, display, update, autoLockMinutes: settings.autoLockMinutes ?? 0, loaded: true });
    await get().refreshTill(false);
    if (!unsubscribeUpdates) unsubscribeUpdates = desktop.updates.onStatus((s) => set({ update: s }));
  },
  setTerminal: async (terminal) => {
    await desktop?.terminal.set(terminal);
    set({ terminal });
    await get().refreshTill(true);
  },
  refreshTill: async (fetch = true) => {
    if (!desktop?.terminal.hasKey || !desktop.staff) return;
    if (fetch) await desktop.staff.refresh().catch(() => undefined);
    // The signing key: fetched (or rotated) with the till's key, dropped if access was withdrawn.
    const signing = desktop.signing
      ? await (fetch ? desktop.signing.refresh() : desktop.signing.status()).catch(() => null)
      : null;
    const [hasKey, staff] = await Promise.all([desktop.terminal.hasKey(), desktop.staff.list()]);
    set({ hasKey, staff, signing });
  },
  setAutoLockMinutes: async (minutes) => {
    if (!desktop) return;
    const settings = await desktop.settings.update({ autoLockMinutes: minutes });
    set({ autoLockMinutes: settings.autoLockMinutes ?? 0 });
  },
  setPrinting: async (printing) => {
    if (!desktop) return;
    set({ printing: await desktop.printing.update(printing) });
  },
  setDrawer: async (drawer) => {
    if (!desktop) return;
    set({ drawer: await desktop.drawer.update(drawer) });
  },
  setDisplay: async (display) => {
    if (!desktop) return;
    set({ display: await desktop.display.update(display) });
  },
}));
