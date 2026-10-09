import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  launch,
  login,
  openPosWithProducts,
  outbox,
  restock,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * Part C, cash drawer (docs/plans/DESKTOP_APP.md). The drawer is set to a
 * "network printer" that is really a TCP server in this test, so the exact
 * ESC/POS bytes the till sends can be checked. Openings must be recorded
 * (and synced) whether or not the server is reachable.
 */
const KICK_PIN2_100MS = "1b 40 1b 70 00 32 64";

/** Stand-in network receipt printer: records each connection's bytes. */
class FakePrinter {
  private server: net.Server | null = null;
  readonly jobs: string[] = [];
  port = 0;

  async start() {
    this.server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => this.jobs.push(Array.from(Buffer.concat(chunks), (b) => b.toString(16).padStart(2, "0")).join(" ")));
    });
    await new Promise<void>((r) => this.server!.listen(this.port, "127.0.0.1", r));
    this.port = (this.server!.address() as net.AddressInfo).port;
  }

  async stop() {
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((r) => s.close(() => r()));
  }
}

interface DrawerEventRow {
  reason: string;
  subReason: string | null;
  note: string | null;
  saleId: string | null;
  saleClientId: string | null;
  succeeded: boolean;
  error: string | null;
  permitted: boolean;
  createdOffline: boolean;
  terminal: { code: string } | null;
}

function serverDrawerEvents(page: Page) {
  return page.evaluate(async () => {
    const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
    const res = await fetch("/api/drawer-events?pageSize=20", { headers: { Authorization: `Bearer ${auth.accessToken}` } });
    if (!res.ok) throw new Error(`drawer events ${res.status}`);
    return ((await res.json()) as { items: DrawerEventRow[] }).items;
  });
}

test.describe.serial("Part C: cash drawer", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const printer = new FakePrinter();
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let terminalCode: string;

  const nextJob = async (count: number) => {
    await expect.poll(() => printer.jobs.length, { timeout: 15_000 }).toBe(count);
    return printer.jobs[count - 1];
  };

  async function cashSale() {
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    await page.keyboard.press("Escape");
  }

  test.beforeAll(async () => {
    await proxy.up();
    await printer.start();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
    await printer.stop();
  });

  test("set up: register the till and point the drawer at the network printer", async () => {
    await page.goto("app://pos/device");
    await page.getByLabel("Till name").fill("Drawer Till");
    await page.getByRole("button", { name: "Register this till" }).click();
    terminalCode = (await page.getByText(/^POS-\d{3}$/).textContent())!;

    await page.getByRole("combobox", { name: "Drawer connection" }).click();
    await page.getByRole("option", { name: "Network printer (IP address)" }).click();
    await page.getByLabel("Printer IP address").fill("127.0.0.1");
    await page.getByLabel("Printer IP address").press("Enter");
    await page.getByLabel("Port", { exact: true }).fill(String(printer.port));
    await page.getByLabel("Port", { exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "Test drawer" })).toBeVisible();
  });

  test("Test drawer sends the kick and records a TEST opening", async () => {
    await page.getByRole("button", { name: "Test drawer" }).click();
    expect(await nextJob(1)).toBe(KICK_PIN2_100MS);
    await expect(page.getByText("Drawer opened")).toBeVisible();
    await expect.poll(async () => (await serverDrawerEvents(page))[0]?.subReason).toBe("TEST");
  });

  test("pin 5 and a longer pulse change the bytes", async () => {
    await page.getByRole("combobox", { name: "Drawer connector" }).click();
    await page.getByRole("option", { name: /Pin 5/ }).click();
    await page.getByLabel("Pulse length (ms)").fill("200");
    await page.getByLabel("Pulse length (ms)").press("Enter");
    await page.getByRole("button", { name: "Test drawer" }).click();
    expect(await nextJob(2)).toBe("1b 40 1b 70 01 64 c8");
    // Back to the usual settings.
    await page.getByRole("combobox", { name: "Drawer connector" }).click();
    await page.getByRole("option", { name: /Pin 2/ }).click();
    await page.getByLabel("Pulse length (ms)").fill("100");
    await page.getByLabel("Pulse length (ms)").press("Enter");
  });

  test("a cash sale opens the drawer and the opening links to the sale", async () => {
    await openPosWithProducts(page);
    await cashSale();
    expect(await nextJob(3)).toBe(KICK_PIN2_100MS);
    await expect
      .poll(async () => (await serverDrawerEvents(page))[0])
      .toMatchObject({ reason: "SALE_CASH_PAYMENT", succeeded: true, terminal: { code: terminalCode } });
    const [latest] = await serverDrawerEvents(page);
    expect(latest.saleId).not.toBeNull();
  });

  test("a card sale doesn't open the drawer", async () => {
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("combobox").filter({ hasText: "Cash" }).click();
    await page.getByRole("option", { name: "Card" }).click();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    expect(printer.jobs).toHaveLength(3);
  });

  test("Open drawer asks for a reason, opens, and records it", async () => {
    await page.getByRole("button", { name: "Open drawer" }).click();
    await page.getByLabel("Float adjustment").check();
    await page.getByLabel("Note (optional)").fill("Added 20 in coins");
    await page.getByRole("dialog").getByRole("button", { name: "Open drawer" }).click();
    expect(await nextJob(4)).toBe(KICK_PIN2_100MS);
    await expect
      .poll(async () => (await serverDrawerEvents(page))[0])
      .toMatchObject({ reason: "MANUAL_OPEN", subReason: "FLOAT_ADJUSTMENT", note: "Added 20 in coins", permitted: true });
  });

  test('"Other" needs a note', async () => {
    await page.getByRole("button", { name: "Open drawer" }).click();
    await page.getByLabel("Other").check();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Open drawer" })).toBeDisabled();
    await page.keyboard.press("Escape");
  });

  test("offline: the drawer still opens, and the opening syncs later", async () => {
    await proxy.down();
    await page.getByRole("button", { name: "Open drawer" }).click();
    await page.getByLabel("Cash pickup").check();
    await page.getByRole("dialog").getByRole("button", { name: "Open drawer" }).click();
    expect(await nextJob(5)).toBe(KICK_PIN2_100MS);

    const pending = (await outbox(page)).filter((e) => e.state === "pending");
    expect(pending).toHaveLength(1);
    // The till tries to upload straight away and fails (server down).
    await expect.poll(async () => (await outbox(page)).find((e) => e.state === "pending")?.attempts).toBeGreaterThan(0);

    await proxy.up();
    await expect.poll(async () => (await outbox(page)).filter((e) => e.state === "pending").length, { timeout: 70_000 }).toBe(0);
    await expect
      .poll(async () => (await serverDrawerEvents(page))[0])
      .toMatchObject({ reason: "MANUAL_OPEN", subReason: "CASH_PICKUP", createdOffline: true });
  });

  test("printer unreachable: the sale completes, the failure is shown and recorded", async () => {
    await printer.stop();
    await openPosWithProducts(page);
    await cashSale();
    await expect(page.getByText(/The cash drawer didn't open: The network printer 127\.0\.0\.1:\d+ refused the connection/)).toBeVisible();
    await expect
      .poll(async () => (await serverDrawerEvents(page))[0])
      .toMatchObject({ reason: "SALE_CASH_PAYMENT", succeeded: false });
    await printer.start();
  });

  test("the Cash drawer page lists openings without a sale", async () => {
    await page.goto("app://pos/drawer-events");
    await expect(page.getByRole("cell", { name: "No sale: Float adjustment" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "Added 20 in coins" }).first()).toBeVisible();
    await page.getByRole("button", { name: "All openings" }).click();
    await expect(page.getByRole("cell", { name: "Cash sale" }).first()).toBeVisible();
  });

  test("a cashier without permission has no Open drawer button, but cash sales still open it", async () => {
    await page.goto("app://pos/pos");
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, "cashier@demo-store.test", "CashierPass123!");
    await openPosWithProducts(page);
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open drawer" })).toHaveCount(0);

    const before = printer.jobs.length;
    await cashSale();
    expect(await nextJob(before + 1)).toBe(KICK_PIN2_100MS);
  });

  test("the log records drawer activity", async () => {
    const text = fs.readFileSync(path.join(userData, "logs", "main.log"), "utf8");
    expect(text).toMatch(/\[drawer\] opened via network printer 127\.0\.0\.1:\d+ \(pin 2/);
    expect(text).toMatch(/\[drawer\] failed via network printer/);
  });
});
