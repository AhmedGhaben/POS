import fs from "node:fs";
import path from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  launch,
  login,
  openPosWithProducts,
  outbox,
  sellFirstProduct,
  serverSales,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * Part A (docs/plans/DESKTOP_APP.md): terminal identity, the server-down
 * cases A0 didn't cover (a 502 from a hosting proxy, a response lost after
 * the server saved the sale), exactly-once sync, the device page and the
 * scrubbed log. Needs the API at POS_TEST_API_URL with the seed data.
 */
test.describe.serial("Part A: terminal, outbox and sync", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let terminalId: string;
  let onlineClientId: string;
  const queued: string[] = [];

  const status = () => page.getByTestId("sync-status");

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("a manager registers this till on the device page", async () => {
    await page.goto("app://pos/device");
    await expect(page.getByText("This till isn't registered yet.")).toBeVisible();
    await page.getByLabel("Till name").fill("Front Till");
    await page.getByRole("button", { name: "Register this till" }).click();
    await expect(page.getByText(/^POS-\d{3}$/)).toBeVisible();

    const terminal = await page.evaluate(() =>
      (window as unknown as { posDesktop: { terminal: { get(): Promise<{ id: string; name: string }> } } }).posDesktop.terminal.get(),
    );
    expect(terminal.name).toBe("Front Till");
    terminalId = terminal.id;
  });

  test("sales carry the terminal", async () => {
    await openPosWithProducts(page);
    await sellFirstProduct(page);
    const [latest] = await serverSales(page);
    expect(latest.terminalId).toBe(terminalId);
    expect(latest.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(latest.createdOffline).toBe(false);
    onlineClientId = latest.clientId!;
  });

  test("a 502 from the hosting proxy counts as offline: the sale is queued", async () => {
    await openPosWithProducts(page);
    proxy.setMode("bad-gateway");
    const receipt = await sellFirstProduct(page);
    expect(receipt).toContain("Saved offline");
    expect(receipt).toMatch(/OFF-[A-Z0-9]{4}-[A-Z0-9]{12}/);
    await expect(status()).toContainText("Working offline — 1 sale waiting to sync");
  });

  test("the device page shows the server as unreachable", async () => {
    await page.goto("app://pos/device");
    await expect(page.getByText("Unreachable", { exact: true })).toBeVisible();
    await expect(page.getByText("Working offline", { exact: true })).toBeVisible();
  });

  test("a response lost after the server saved the sale still syncs exactly once", async () => {
    proxy.setMode("pass");
    await openPosWithProducts(page);
    proxy.setMode("lose-responses");
    // The till may already know the server is down (and queue at once), or
    // try, lose the answer, and queue: either way the sale is kept.
    const receipt = await sellFirstProduct(page);
    expect(receipt).toContain("Saved offline");

    // Every sale that went through the outbox (the 502 one may already have
    // synced the moment the server answered again).
    for (const e of await outbox(page)) queued.push(e.clientId);
    expect(queued).toHaveLength(2);
  });

  test("server back: both queued sales arrive once each and are marked synced", async () => {
    proxy.setMode("pass");
    await expect(status()).toBeHidden({ timeout: 70_000 });

    // The list holds the store's latest 50 sales, which covers this run.
    const sales = await serverSales(page);
    for (const clientId of [onlineClientId, ...queued]) {
      expect(sales.filter((s) => s.clientId === clientId)).toHaveLength(1);
    }
    // The 502 sale was rung up offline; the lost-response one was saved
    // online before the line dropped, and the retry just found it.
    const byClient = (id: string) => sales.find((s) => s.clientId === id)!;
    expect(byClient(queued[0]).createdOffline).toBe(true);
    expect(byClient(queued[1]).createdOffline).toBe(false);
    const states = Object.fromEntries((await outbox(page)).map((e) => [e.clientId, e.state]));
    expect(queued.map((id) => states[id])).toEqual(["synced", "synced"]);
  });

  test("the log records sync activity and no secrets", async () => {
    const logFile = path.join(userData, "logs", "main.log");
    await expect.poll(() => fs.existsSync(logFile)).toBe(true);
    const text = fs.readFileSync(logFile, "utf8");
    expect(text).toContain("[terminal] this till is POS-");
    expect(text).toMatch(/\[sync\] server unreachable/);
    expect(text).toMatch(/\[sync\] synced \d+/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    expect(text).not.toContain("OwnerPass123!");
  });
});
