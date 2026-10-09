import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, SwitchableProxy, tempUserData } from "./helpers";

/**
 * Part E, auto-update (docs/plans/DESKTOP_APP.md). Runs only against a
 * packaged test build, with a second, newer build served as the feed:
 *
 *   npm run dist:test                       → release/win-unpacked (0.2.0)
 *   POS_TEST_BUILD=1 POS_RELEASE_DIR=release-next POS_VERSION_OVERRIDE=0.2.1 \
 *     npx electron-builder --config electron-builder.config.js --win nsis
 *   POS_DESKTOP_EXECUTABLE=release/win-unpacked/POS.exe \
 *     POS_TEST_UPDATE_FEED=release-next npx playwright test e2e/updates.spec.ts
 *
 * It checks the update is found, downloaded and verified (sha512), and
 * offered as "ready" without restarting anything. Installing is left to
 * the hardware checklist: it would replace the installed app on this PC.
 */
const feedDir = process.env.POS_TEST_UPDATE_FEED;

test.describe.serial("Part E: auto-update", () => {
  test.skip(!feedDir || !process.env.POS_DESKTOP_EXECUTABLE, "needs a packaged build and an update feed");

  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let feed: http.Server | null = null;
  let feedPort = 0;
  let app: ElectronApplication;
  let page: Page;

  /** Serves the feed folder (latest.yml + installer), like GitHub Releases would. */
  async function startFeed() {
    feed = http.createServer((req, res) => {
      const file = path.join(path.resolve(feedDir!), decodeURIComponent(new URL(req.url!, "http://x").pathname));
      if (!file.startsWith(path.resolve(feedDir!)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Length": fs.statSync(file).size });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise<void>((r) => feed!.listen(feedPort, "127.0.0.1", r));
    feedPort = (feed!.address() as { port: number }).port;
  }

  test.beforeAll(async () => {
    await proxy.up();
    await startFeed();
    const url = `http://127.0.0.1:${feedPort}`;
    await new Promise<void>((r) => feed!.close(() => r()));
    feed = null;
    // Never install: closing the test app would put the test build over the
    // POS installed on this computer.
    ({ app, page } = await launch(userData, { POS_DESKTOP_UPDATE_URL: url, POS_DESKTOP_UPDATE_INSTALL_ON_QUIT: "0" }));
    await connect(page, proxy.url);
    await login(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
    feed?.close();
  });

  test("update server unreachable: a clear message, nothing breaks", async () => {
    await page.goto("app://pos/device");
    await page.getByRole("button", { name: "Check for updates" }).click();
    await expect(page.getByTestId("update-status")).toHaveText("Couldn't reach the update server (offline?)", {
      timeout: 30_000,
    });
  });

  test("a newer version is downloaded, verified and offered on restart", async () => {
    await startFeed(); // same port as the app was given
    await page.getByRole("button", { name: "Check for updates" }).click();
    await expect(page.getByTestId("update-status")).toHaveText("Version 0.2.1 ready, installs on the next restart", {
      timeout: 120_000,
    });
    await expect(page.getByRole("button", { name: "Restart and update now" })).toBeVisible();

    await page.goto("app://pos/pos");
    await expect(page.getByRole("link", { name: /Update 0\.2\.1 ready/ })).toBeVisible();
  });

  test("the log records the update", async () => {
    const text = fs.readFileSync(path.join(userData, "logs", "main.log"), "utf8");
    expect(text).toContain("[update] 0.2.1 available, downloading");
    expect(text).toContain("[update] 0.2.1 downloaded, installs on next restart");
  });
});
