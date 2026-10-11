import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { log } from "./logging";

/**
 * Auto-update. New versions download in the background and install when
 * the app next quits, so a sale is never interrupted; "Restart and update"
 * on This device applies one sooner.
 *
 * Feed: this repository's GitHub Releases (see electron-builder.config.js).
 * POS_DESKTOP_UPDATE_URL points at another feed (a folder with latest.yml
 * and the installer) for testing.
 */
/**
 * `code` lets the app's screens show the message in their own language;
 * `reason`/`error` is the English text (logs, older web builds).
 */
export type UpdateErrorCode = "offline" | "damaged" | "none-published" | "other";
export type UpdateStatus =
  | { state: "disabled"; reason: string; code: "dev-build" }
  | { state: "idle" | "checking" | "up-to-date"; checkedAt?: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; error: string; code: UpdateErrorCode; checkedAt?: string };

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_AFTER_MS = 15_000;

let status: UpdateStatus = { state: "idle" };
let enabled = false;

function setStatus(next: UpdateStatus) {
  status = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("updates:status", status);
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function initUpdater() {
  const testFeed = process.env.POS_DESKTOP_UPDATE_URL;
  if (!app.isPackaged && !testFeed) {
    status = { state: "disabled", reason: "Updates only run in the installed app", code: "dev-build" };
    return;
  }
  enabled = true;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  // Tests set POS_DESKTOP_UPDATE_INSTALL_ON_QUIT=0: otherwise closing the
  // test app would install the test build over the real one on that PC.
  autoUpdater.autoInstallOnAppQuit = process.env.POS_DESKTOP_UPDATE_INSTALL_ON_QUIT !== "0";
  autoUpdater.allowPrerelease = false;
  if (testFeed) {
    autoUpdater.setFeedURL({ provider: "generic", url: testFeed });
    autoUpdater.forceDevUpdateConfig = !app.isPackaged;
  }

  autoUpdater.on("checking-for-update", () => setStatus({ state: "checking" }));
  autoUpdater.on("update-not-available", () => setStatus({ state: "up-to-date", checkedAt: new Date().toISOString() }));
  autoUpdater.on("update-available", (info) => {
    log.info(`[update] ${info.version} available, downloading`);
    setStatus({ state: "downloading", version: info.version, percent: 0 });
  });
  autoUpdater.on("download-progress", (p) => {
    if (status.state === "downloading") setStatus({ ...status, percent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    log.info(`[update] ${info.version} downloaded, installs on next restart`);
    setStatus({ state: "ready", version: info.version });
  });
  autoUpdater.on("error", (err) => {
    log.warn(`[update] ${err.message}`);
    // A ready update stays ready even if a later check fails.
    if (status.state !== "ready") {
      setStatus({ state: "error", ...friendlyError(err.message), checkedAt: new Date().toISOString() });
    }
  });

  setTimeout(() => void checkForUpdates(), FIRST_CHECK_AFTER_MS);
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS).unref();
}

function friendlyError(message: string): { error: string; code: UpdateErrorCode } {
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(message)) {
    return { error: "Couldn't reach the update server (offline?)", code: "offline" };
  }
  if (/sha512 checksum mismatch/i.test(message)) {
    return { error: "The download was damaged; it will be fetched again", code: "damaged" };
  }
  if (/404|Cannot find latest/i.test(message)) return { error: "No published version found yet", code: "none-published" };
  return { error: message.split("\n")[0].slice(0, 200), code: "other" };
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!enabled) return status;
  if (status.state === "checking" || status.state === "downloading" || status.state === "ready") return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // reported through the "error" event
  }
  return status;
}

/** Only on request from the device page: quits and runs the installer. */
export function installUpdateNow(): boolean {
  if (status.state !== "ready") return false;
  log.info(`[update] restarting to install ${status.version}`);
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}
