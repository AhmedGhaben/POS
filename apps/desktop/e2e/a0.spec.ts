import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, launch, refreshStatus, SwitchableProxy, tempUserData } from "./helpers";

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

  async function openPos() {
    await page.goto("app://pos/pos");
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeVisible();
  }

  /** Picks the first category so its products are loaded (and cached in memory). */
  async function showFirstCategory() {
    await page.getByRole("button", { name: "All", exact: true }).locator("xpath=following-sibling::button[1]").click();
    await expect(page.locator("div.grid > button.text-left").first()).toBeVisible();
  }

  async function sellFirstProduct() {
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }

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
    expect(env).toEqual({ require: "undefined", process: "undefined", bridge: ["app", "settings"] });
  });

  test("first run asks for the server address and rejects a bad one", async () => {
    await expect(page.getByRole("heading", { name: "Connect this till" })).toBeVisible();
    await page.getByLabel("Server address").fill("http://127.0.0.1:9");
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn't reach");

    await page.getByLabel("Server address").fill(proxy.url);
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page).toHaveURL(/^app:\/\/pos\/login/);
  });

  test("navigation outside the app is blocked", async () => {
    await page.evaluate(() => {
      window.location.href = "file:///C:/Windows/win.ini";
    });
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/^app:\/\/pos\//);
  });

  test("logs in through the forwarded API", async () => {
    await page.getByLabel("Email").fill("owner@demo-store.test");
    await page.getByLabel("Password").fill("OwnerPass123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    // The refresh cookie is httpOnly and held by the main process, not the page.
    expect(await page.evaluate(() => document.cookie)).not.toContain("refresh");
  });

  test("session survives closing and reopening the app", async () => {
    await restart();
    await expect(page).not.toHaveURL(/\/login|setup\.html/);
    await openPos();
    expect(await refreshStatus(page)).toBe(200);
  });

  test("an expired access token is refreshed with the cookie", async () => {
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("pos-auth")!);
      raw.state.accessToken = "expired.or.bogus";
      localStorage.setItem("pos-auth", JSON.stringify(raw));
    });
    await page.reload();
    await openPos();
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.accessToken))
      .toMatch(/^ey/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("server goes down mid-session: the POS keeps selling", async () => {
    await openPos();
    await showFirstCategory();
    await proxy.down();
    await sellFirstProduct();
    await expect(page.getByRole("button", { name: /1 pending/ })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("restart while the server is down keeps the session and the queue", async () => {
    await restart();
    await expect(page).not.toHaveURL(/\/login|setup\.html/);
    await page.goto("app://pos/pos");
    await expect(page.getByRole("button", { name: /1 pending/ })).toBeVisible();
  });

  // Known gap 5 (plan): the catalog lives only in memory/the service worker,
  // so after an offline restart there is nothing to sell. Fixed in part A.
  test("restart while the server is down still shows the catalog", async () => {
    test.fail(true, "gap 5: no offline catalog without a service worker (part A)");
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible({ timeout: 5_000 });
  });

  // Known gap 4 (plan): nothing retries on its own when only the server was
  // down (the browser never fires "online"). Fixed in part A.
  test("server back: the queue syncs without a click", async () => {
    test.fail(true, "gap 4: no automatic sync when the server returns (part A)");
    await proxy.up();
    await expect(page.getByRole("button", { name: /pending/ })).toBeHidden({ timeout: 10_000 });
  });

  test("server back: the queued sale syncs", async () => {
    await proxy.up();
    await page.getByRole("button", { name: /1 pending/ }).click();
    await expect(page.getByRole("button", { name: /pending/ })).toBeHidden();
    await expect(page.getByText(/Synced 1 offline sale/)).toBeVisible();
  });

  test("logout clears the session and the refresh cookie", async () => {
    await openPos();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await refreshStatus(page)).toBe(401);
  });
});
