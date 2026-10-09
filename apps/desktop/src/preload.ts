import { contextBridge, ipcRenderer } from "electron";

/**
 * The only bridge between the page and the desktop layer. Each operation is
 * a named, typed function; `ipcRenderer` itself is never exposed.
 */
const posDesktop = {
  app: {
    info: (): Promise<{ version: string; platform: string }> => ipcRenderer.invoke("app:info"),
  },
  settings: {
    get: (): Promise<{ serverUrl: string | null }> => ipcRenderer.invoke("settings:get"),
    setServer: (url: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke("settings:set-server", url),
  },
};

export type PosDesktopApi = typeof posDesktop;

contextBridge.exposeInMainWorld("posDesktop", posDesktop);
