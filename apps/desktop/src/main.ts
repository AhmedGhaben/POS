import { app, BrowserWindow, ipcMain, net, session, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { z } from "zod";
import { getConfig, normalizeServerUrl, settingsPatchSchema, terminalSchema, updateConfig } from "./config";
import { initLogging, log, logFilePath } from "./logging";
import { APP_ORIGIN, handleAppScheme, registerAppScheme } from "./protocol";

// Tests (and a second profile on one PC) point the app at another data folder.
if (process.env.POS_DESKTOP_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.POS_DESKTOP_USER_DATA));
}

initLogging();
registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

process.on("uncaughtException", (err) => log.error("[main] uncaught", err));
process.on("unhandledRejection", (err) => log.error("[main] unhandled rejection", err));

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
    kiosk: !!getConfig().kiosk,
    autoHideMenuBar: true,
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
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    log.error(`[renderer] gone: ${details.reason} (exit ${details.exitCode})`);
  });
  void mainWindow.loadURL(startUrl());
}

/** Only our own pages, loaded from app://pos, may call the desktop bridge. */
function assertTrustedSender(event: IpcMainInvokeEvent) {
  const frameUrl = event.senderFrame?.url ?? "";
  if (!frameUrl.startsWith(`${APP_ORIGIN}/`)) {
    log.warn(`[ipc] rejected call from ${frameUrl || "unknown frame"}`);
    throw new Error("Untrusted sender");
  }
}

/** One named, validated operation. Arguments that don't match are refused. */
function handle<A extends unknown[], R>(
  channel: string,
  args: z.ZodType<A>,
  fn: (...a: A) => R | Promise<R>,
) {
  ipcMain.handle(channel, async (event, ...raw) => {
    assertTrustedSender(event);
    const parsed = args.safeParse(raw);
    if (!parsed.success) {
      log.warn(`[ipc] invalid arguments for ${channel}`);
      throw new Error(`Invalid arguments for ${channel}`);
    }
    return fn(...parsed.data);
  });
}

async function probeServer(serverUrl: string): Promise<void> {
  const res = await net.fetch(`${serverUrl}/health`, {
    signal: AbortSignal.timeout(8000),
    bypassCustomProtocolHandlers: true,
  });
  if (!res.ok) throw new Error(`Server answered ${res.status}`);
}

function applyStartWithWindows(enabled: boolean) {
  // In development this would register electron.exe itself; only the
  // installed app should start with Windows.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled });
}

function publicSettings() {
  const config = getConfig();
  return {
    serverUrl: config.serverUrl ?? null,
    kiosk: !!config.kiosk,
    startWithWindows: !!config.startWithWindows,
  };
}

function registerIpc() {
  handle("app:info", z.tuple([]), () => ({
    version: app.getVersion(),
    platform: process.platform,
    logFile: logFilePath(),
  }));

  handle("app:open-log-folder", z.tuple([]), () => {
    shell.showItemInFolder(logFilePath());
  });

  handle("settings:get", z.tuple([]), publicSettings);

  handle("settings:update", z.tuple([settingsPatchSchema]), (patch) => {
    updateConfig(patch);
    if (patch.kiosk !== undefined) mainWindow?.setKiosk(patch.kiosk);
    if (patch.startWithWindows !== undefined) applyStartWithWindows(patch.startWithWindows);
    log.info(`[settings] updated ${Object.keys(patch).join(", ")}`);
    return publicSettings();
  });

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
    const changed = getConfig().serverUrl !== serverUrl;
    // A till registered with one server means nothing to another.
    updateConfig(changed ? { serverUrl, terminal: null } : { serverUrl });
    log.info(`[setup] server set to ${serverUrl}`);
    setTimeout(() => void mainWindow?.loadURL(`${APP_ORIGIN}/`), 0);
    return { ok: true as const };
  });

  handle("terminal:get", z.tuple([]), () => getConfig().terminal ?? null);

  handle("terminal:set", z.tuple([terminalSchema.nullable()]), (terminal) => {
    updateConfig({ terminal });
    log.info(terminal ? `[terminal] this till is ${terminal.code} "${terminal.name}"` : "[terminal] cleared");
  });

  handle(
    "log:write",
    z.tuple([z.enum(["info", "warn", "error"]), z.string().max(2000)]),
    (level, message) => {
      log[level](`[page] ${message}`);
    },
  );
}

/** Keep the window on our own pages; real web links open in the browser. */
function lockNavigation() {
  app.on("web-contents-created", (_e, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!url.startsWith(`${APP_ORIGIN}/`)) {
        event.preventDefault();
        log.warn(`[nav] blocked ${url.slice(0, 200)}`);
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
