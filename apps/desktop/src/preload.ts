import { contextBridge, ipcRenderer } from "electron";

interface Terminal {
  id: string;
  name: string;
  code: string;
  storeId: string;
}

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
  log: {
    write: (level: "info" | "warn" | "error", message: string): void => {
      void ipcRenderer.invoke("log:write", level, String(message).slice(0, 2000)).catch(() => {});
    },
  },
};

contextBridge.exposeInMainWorld("posDesktop", posDesktop);
