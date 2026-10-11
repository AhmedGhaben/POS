import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  API_URL,
  connect,
  launch,
  login,
  openPosWithProducts,
  outbox,
  restock,
  serverSales,
  SwitchableProxy,
  tempUserData,
} from "./helpers";

/**
 * PIN sign-in on a till (docs/plans/TILL_ESSENTIALS.md, part 3): the till
 * gets its key when registered, staff sign in with a PIN, the till locks,
 * and a different cashier can take over while the server is down; their
 * sale uploads under their name and their session follows.
 */
const CASHIER_PIN = "2468";
const OWNER_PIN = "8642";

interface Me {
  id: string;
  firstName: string;
  lastName: string;
}

function api<T>(page: Page, path: string, init: { method?: string; body?: unknown } = {}) {
  return page.evaluate(
    async ({ path, init }) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const res = await fetch(`/api${path}`, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      if (!res.ok) throw new Error(`${path} ${res.status}`);
      return res.json();
    },
    { path, init },
  ) as Promise<T>;
}

function authState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state as { accessToken: string | null; offline: boolean; user: Me | null });
}

async function typePin(page: Page, pin: string) {
  for (const digit of pin) await page.keyboard.press(digit);
  await page.keyboard.press("Enter");
}

test.describe.serial("Till: PIN sign-in", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let owner: Me;
  let cashier: Me;

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    owner = (await authState(page)).user!;
    const users = await api<(Me & { email: string })[]>(page, "/users");
    cashier = users.find((u) => u.email === "cashier@demo-store.test")!;
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("registering the till gives it a key; PINs set by the owner show up", async () => {
    await page.goto("app://pos/device");
    await page.getByLabel("Till name").fill("PIN Till");
    await page.getByRole("button", { name: "Register this till" }).click();
    await expect(page.getByText(/^POS-\d{3}$/)).toBeVisible();
    // The key never reaches the page.
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored).not.toMatch(/[0-9a-f]{64}/);
    expect(await page.evaluate(() => (window as any).posDesktop.terminal.hasKey())).toBe(true);

    await api(page, `/users/${cashier.id}/pin`, { method: "PUT", body: { pin: CASHIER_PIN } });
    await api(page, "/users/me/pin", { method: "PUT", body: { pin: OWNER_PIN, password: "OwnerPass123!" } });
    await page.evaluate(() => (window as any).posDesktop.staff.refresh());
    await page.reload();
    await expect(page.getByTestId("pin-status")).toContainText(/Ready: \d+ people can sign in here/);
  });

  test("lock, then the cashier unlocks with their PIN and takes over", async () => {
    await openPosWithProducts(page);
    await page.getByRole("button", { name: "Lock till" }).click();
    const overlay = page.getByRole("dialog", { name: "Till locked" });
    await expect(overlay).toBeVisible();
    await overlay.getByRole("button", { name: `${cashier.firstName} ${cashier.lastName}` }).click();
    await typePin(page, "1111");
    await expect(overlay).toContainText("Wrong PIN");
    await typePin(page, CASHIER_PIN);
    await expect(overlay).toBeHidden();
    expect((await authState(page)).user?.id).toBe(cashier.id);
    await expect(page.getByRole("link", { name: "Back to dashboard" })).toHaveCount(0);
  });

  test("offline: the owner takes over with their PIN, sells, and it syncs under their name", async () => {
    await proxy.down();
    await page.getByRole("button", { name: "Lock till" }).click();
    const overlay = page.getByRole("dialog", { name: "Till locked" });
    await overlay.getByRole("button", { name: `${owner.firstName} ${owner.lastName}` }).click();
    await typePin(page, OWNER_PIN);
    await expect(overlay).toBeHidden();
    const state = await authState(page);
    expect(state).toMatchObject({ offline: true, accessToken: null, user: { id: owner.id } });

    await openPosWithProducts(page);
    await page.locator("div.grid > button.text-left").first().click();
    await page.getByRole("button", { name: /^Charge/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Saved offline");
    await page.keyboard.press("Escape");

    await proxy.up();
    await expect
      .poll(async () => (await outbox(page)).filter((e) => e.state !== "synced").length, { timeout: 70_000 })
      .toBe(0);
    // The session follows once the server answers.
    await expect.poll(async () => (await authState(page)).accessToken, { timeout: 70_000 }).not.toBeNull();
    expect((await authState(page)).offline).toBe(false);
    const [latest] = (await serverSales(page)) as unknown as { cashierId: string; createdOffline: boolean }[];
    expect(latest).toMatchObject({ cashierId: owner.id, createdOffline: true });
  });

  test("signing out shows the name buttons, with email as the other way in", async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByText("Tap your name")).toBeVisible();
    await page.getByRole("button", { name: `${cashier.firstName} ${cashier.lastName}` }).click();
    await typePin(page, CASHIER_PIN);
    await page.waitForURL(/\/pos$/);
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByRole("button", { name: "Sign in with email instead" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});
