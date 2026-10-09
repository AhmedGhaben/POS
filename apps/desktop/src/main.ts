import { app, BrowserWindow, ipcMain, net, session, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import log from "electron-log/main";
import { z } from "zod";
import { getConfig, normalizeServerUrl, updateConfig } from "./config";
import { APP_ORIGIN, handleAppScheme, registerAppScheme } from "./protocol";

// Tests (and a second profile on one PC) point the app at another data folder.
if (process.env.POS_DESKTOP_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.POS_DESKTOP_USER_DATA));
}

log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024;

registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function startUrl() {
  return getConfig().serverUrl ? `${APP_ORIGIN}/` : `${APP_ORIGIN}/__desktop/setup.html`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: "POS",
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(startUrl());
}

/** Only our own pages, loaded from app://pos, may call the desktop bridge. */
function assertTrustedSender(event: IpcMainInvokeEvent) {
  const frameUrl = event.senderFrame?.url ?? "";
  if (!frameUrl.startsWith(`${APP_ORIGIN}/`)) {
    throw new Error("Untrusted sender");
  }
}

function handle<A extends unknown[], R>(
  channel: string,
  args: z.ZodType<A>,
  fn: (...a: A) => R | Promise<R>,
) {
  ipcMain.handle(channel, async (event, ...raw) => {
    assertTrustedSender(event);
    return fn(...args.parse(raw));
  });
}

async function probeServer(serverUrl: string): Promise<void> {
  const res = await net.fetch(`${serverUrl}/health`, {
    signal: AbortSignal.timeout(8000),
    bypassCustomProtocolHandlers: true,
  });
  if (!res.ok) throw new Error(`Server answered ${res.status}`);
}

function registerIpc() {
  handle("app:info", z.tuple([]), () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));

  handle("settings:get", z.tuple([]), () => ({ serverUrl: getConfig().serverUrl ?? null }));

  handle("settings:set-server", z.tuple([z.string().min(1).max(500)]), async (input) => {
    let serverUrl: string;
    try {
      serverUrl = normalizeServerUrl(input);
    } catch (err) {
      return { ok: false as const, error: (err as Error).message || "Not a valid address" };
    }
    try {
      await probeServer(serverUrl);
    } catch (err) {
      log.warn(`[setup] server check failed for ${serverUrl}: ${(err as Error).message}`);
      return { ok: false as const, error: "Couldn't reach a POS server at that address" };
    }
    updateConfig({ serverUrl });
    log.info(`[setup] server set to ${serverUrl}`);
    setTimeout(() => void mainWindow?.loadURL(`${APP_ORIGIN}/`), 0);
    return { ok: true as const };
  });
}

/** Keep the window on our own pages; real web links open in the browser. */
function lockNavigation() {
  app.on("web-contents-created", (_e, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!url.startsWith(`${APP_ORIGIN}/`)) {
        event.preventDefault();
        if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      }
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
  });
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  log.info(`[app] start ${app.getVersion()} userData=${app.getPath("userData")}`);
  // The page never needs camera, mic, location, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  handleAppScheme();
  registerIpc();
  lockNavigation();
  createWindow();
});

app.on("before-quit", () => {
  // Persist the refresh cookie now rather than on Chromium's own schedule.
  void session.defaultSession.cookies.flushStore();
  log.info("[app] quit");
});

app.on("window-all-closed", () => app.quit());
