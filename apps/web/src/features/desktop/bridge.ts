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
  loaded: boolean;
  load: () => Promise<void>;
  setTerminal: (terminal: DesktopTerminal | null) => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  terminal: null,
  loaded: !isDesktop,
  load: async () => {
    if (!desktop) return;
    set({ terminal: await desktop.terminal.get(), loaded: true });
  },
  setTerminal: async (terminal) => {
    await desktop?.terminal.set(terminal);
    set({ terminal });
  },
}));
