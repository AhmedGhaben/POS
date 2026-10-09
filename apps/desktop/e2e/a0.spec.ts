import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  launch,
  login,
  restock,
  openPosWithProducts,
  refreshStatus,
  sellFirstProduct,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * A0 proof of concept (docs/plans/DESKTOP_APP.md): the bundled web app,
 * the app:// → API forwarding, the session across restarts, refresh, logout,
 * and selling while the server is unreachable. Needs the API running at
 * POS_TEST_API_URL (default http://localhost:4000) with the seed data.
 */
test.describe.serial("A0: desktop shell, auth and offline", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  async function restart() {
    await app.close();
    ({ app, page } = await launch(userData));
  }

  const waiting = (n: number) => page.getByText(new RegExp(`${n} sales? waiting to sync`));

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("renderer is sandboxed and only sees the typed bridge", async () => {
    const env = await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      bridge: Object.keys((window as unknown as { posDesktop: object }).posDesktop).sort(),
    }));
    expect(env).toEqual({
      require: "undefined",
      process: "undefined",
      bridge: ["app", "display", "drawer", "hardware", "log", "printers", "printing", "settings", "terminal", "updates"],
    });
  });

  test("first run asks for the server address and rejects a bad one", async () => {
    await expect(page.getByRole("heading", { name: "Connect this till" })).toBeVisible();
    await page.getByLabel("Server address").fill("http://127.0.0.1:9");
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn't reach");

    await connect(page, proxy.url);
    await expect(page).toHaveURL(/^app:\/\/pos\/login/);
  });

  test("navigation outside the app is blocked", async () => {
    await page.evaluate(() => {
      window.location.href = "file:///C:/Windows/win.ini";
    });
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/^app:\/\/pos\//);
  });

  test("a call with bad arguments is refused by the main process", async () => {
    const error = await page.evaluate(() =>
      (window as unknown as { posDesktop: { terminal: { set: (t: unknown) => Promise<void> } } }).posDesktop.terminal
        .set({ id: 42 })
        .then(() => "accepted")
        .catch((e: Error) => e.message),
    );
    expect(error).toContain("Invalid arguments");
  });

  test("logs in through the forwarded API", async () => {
    await login(page);
    await restock(page);
    // The refresh cookie is httpOnly and held by the main process, not the page.
    expect(await page.evaluate(() => document.cookie)).not.toContain("refresh");
  });

  test("session survives closing and reopening the app", async () => {
    await restart();
    await expect(page).not.toHaveURL(/\/login|setup\.html/);
    await openPosWithProducts(page);
    expect(await refreshStatus(page)).toBe(200);
  });

  test("an expired access token is refreshed with the cookie", async () => {
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("pos-auth")!);
      raw.state.accessToken = "expired.or.bogus";
      localStorage.setItem("pos-auth", JSON.stringify(raw));
    });
    await page.reload();
    await openPosWithProducts(page);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.accessToken))
      .toMatch(/^ey/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("server goes down mid-session: the POS keeps selling", async () => {
    await openPosWithProducts(page);
    await proxy.down();
    const receipt = await sellFirstProduct(page);
    expect(receipt).toContain("Saved offline");
    await expect(waiting(1)).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("restart while the server is down keeps the session and the queue", async () => {
    await restart();
    await expect(page).not.toHaveURL(/\/login|setup\.html/);
    await page.goto("app://pos/pos");
    await expect(waiting(1)).toBeVisible();
  });

  test("restart while the server is down still shows the saved catalog", async () => {
    await openPosWithProducts(page);
    await sellFirstProduct(page);
    await expect(waiting(2)).toBeVisible();
  });

  test("server back: the queue syncs without a click", async () => {
    await proxy.up();
    // The engine retries on a timer with backoff; this checks it gets there.
    await expect(page.getByTestId("sync-status")).toBeHidden({ timeout: 70_000 });
  });

  test("logout clears the session and the refresh cookie", async () => {
    await page.goto("app://pos/pos");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await refreshStatus(page)).toBe(401);
  });
});
