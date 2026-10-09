import fs from "node:fs";
import path from "node:path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  FakePrinter,
  launch,
  login,
  openPosWithProducts,
  restock,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * Part D, customer displays (docs/plans/DESKTOP_APP.md). The pole display
 * is pointed at a fake network device that records the lines it's sent;
 * the second-monitor display is the real window the app opens.
 */
test.describe.serial("Part D: customer displays", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const pole = new FakePrinter();
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let productName: string;

  /** Waits for the pole to be sent text matching `pattern`; returns it. */
  async function poleShows(pattern: RegExp) {
    let match: string | undefined;
    await expect
      .poll(
        () => {
          match = [...pole.texts].reverse().find((t) => pattern.test(t));
          return match;
        },
        { timeout: 15_000 },
      )
      .toBeTruthy();
    return match!;
  }

  async function choose(label: string, option: string | RegExp) {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option }).click();
  }

  test.beforeAll(async () => {
    await proxy.up();
    await pole.start();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
    await pole.stop();
  });

  test("pole display: set up over the network and test it", async () => {
    await page.goto("app://pos/device");
    await choose("Customer display", /^Pole display/);
    await choose("Display connection", "Network (IP address)");
    await page.getByLabel("Display IP address").fill("127.0.0.1");
    await page.getByLabel("Display IP address").press("Enter");
    await page.getByLabel("Display port").fill(String(pole.port));
    await page.getByLabel("Display port").press("Enter");
    await page.getByLabel("Welcome message").fill("Hello from Demo");
    await page.getByLabel("Welcome message").press("Enter");

    await page.getByRole("button", { name: "Test display" }).click();
    const text = await poleShows(/POS DISPLAY TEST/);
    // Epson command set: ESC @, clear, cursor to line 1 / line 2.
    expect(text.startsWith("\x1b@\x0c\x1f$\x01\x01")).toBe(true);
    expect(text).toContain("\x1f$\x01\x0212345678901234567890");
  });

  test("ringing up shows the item and the running total", async () => {
    await openPosWithProducts(page);
    await poleShows(/Hello from Demo/);
    const first = page.locator("div.grid > button.text-left").first();
    productName = (await first.locator("p").first().textContent())!;
    await first.click();
    const text = await poleShows(/TOTAL/);
    expect(text).toContain(productName.slice(0, 10));

    await first.click();
    await poleShows(new RegExp(`2x ${productName.slice(0, 8).replace(/[()]/g, ".")}`));
  });

  test("after a cash sale it shows paid and change, then the welcome again", async () => {
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    const paid = await poleShows(/PAID.*CHANGE/s);
    expect(paid).toMatch(/CHANGE\s+\S+ 0\.00/);
    await page.keyboard.press("Escape");
    await poleShows(/Hello from Demo/);
  });

  test("CD5220 command set", async () => {
    await page.goto("app://pos/device");
    await choose("Command set", "CD5220");
    await page.getByRole("button", { name: "Test display" }).click();
    const text = await poleShows(/\x1bQA/);
    expect(text).toContain("\x1bQA");
    expect(text).toContain("\r\x1bQB12345678901234567890\r");
  });

  test("display unreachable: selling carries on, the failure is logged once", async () => {
    await pole.stop();
    await openPosWithProducts(page);
    for (let i = 0; i < 3; i++) await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Sale complete");
    await page.keyboard.press("Escape");
    await pole.start();

    const log = fs.readFileSync(path.join(userData, "logs", "main.log"), "utf8");
    const failure = `[display] The network display 127.0.0.1:${pole.port} refused the connection`;
    expect(log.split("\n").filter((line) => line.includes(failure))).toHaveLength(1);
  });

  test("second monitor: the customer screen follows the cart and shows the change", async () => {
    await page.goto("app://pos/device");
    const opened = app.waitForEvent("window", (w) => w.url().endsWith("/customer-display"));
    await choose("Customer display", /^Second monitor/);
    const customer = await opened;
    await expect(customer.getByTestId("customer-display")).toBeVisible();
    await expect(customer.getByText("Hello from Demo")).toBeVisible();

    await openPosWithProducts(page);
    await page.locator("div.grid > button.text-left").first().click();
    const posTotal = (await page.getByRole("button", { name: /^Charge/ }).textContent())!.replace("Charge ", "");
    await expect(customer.getByTestId("customer-total")).toHaveText(posTotal);
    await expect(customer.getByText(productName)).toBeVisible();

    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(customer.getByText("Thank you!")).toBeVisible();
    await expect(customer.getByTestId("customer-change")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(customer.getByText("Hello from Demo")).toBeVisible();
  });

  test("turning the display off closes the customer screen", async () => {
    await page.goto("app://pos/device");
    const before = app.windows().length;
    await choose("Customer display", "No customer display");
    await expect.poll(() => app.windows().length).toBe(before - 1);
  });
});
