import { randomUUID } from "crypto";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, logOut, openPosWithProducts, registerTill, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * Shifts follow selling, not signing in (docs/DECISIONS.md, "Shifts follow
 * selling"): looking at the back office never needs a shift; a till opens
 * one, with a float, when someone goes to sell; a back-office device never
 * does; an empty shift closes in one click; and a manager at a cashier's
 * till leaves the cashier's shift alone.
 */
const CASHIER_PIN = "2468";
const OWNER_PIN = "8642";

interface ShiftRow {
  status: "OPEN" | "CLOSED";
  clientId: string;
  openingFloat: string;
  countedCash: string | null;
  difference: string | null;
  openedBy: { id: string };
}

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

const authState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state as { currentStoreId: string; user: Me | null });

/** The shift this device remembers (null when none). */
const localShift = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("pos-shift") ?? "{}").state?.current ?? null) as { clientId: string; openedBy: { id: string } } | null);

async function typePin(page: Page, pin: string) {
  for (const digit of pin) await page.keyboard.press(digit);
  await page.keyboard.press("Enter");
}

/** Log out: the POS screen's button, or the back office's Account menu. */
async function clickLogOut(page: Page) {
  const button = page.getByRole("button", { name: "Log out" });
  if (await button.isVisible()) return button.click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
}

/** Log out, expecting no cash count: straight to the sign-in page. */
async function plainLogOut(page: Page) {
  await clickLogOut(page);
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("dialog").filter({ hasText: "Close the till" })).toHaveCount(0);
}

test.describe.serial("Shifts follow selling", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let owner: Me;
  let cashier: Me;
  let storeId: string;

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    owner = (await authState(page)).user!;
    storeId = (await authState(page)).currentStoreId;
    const users = await api<(Me & { email: string })[]>(page, "/users");
    cashier = users.find((u) => u.email === "cashier@demo-store.test")!;
    // The cashier's and the owner's PINs, for switching at the till below.
    await api(page, `/users/${cashier.id}/pin`, { method: "PUT", body: { pin: CASHIER_PIN } });
    await api(page, "/users/me/pin", { method: "PUT", body: { pin: OWNER_PIN, password: "OwnerPass123!" } });
    await registerTill(page, "Shift Scope Till");
    await page.evaluate(() => (window as unknown as { posDesktop: { staff: { refresh(): Promise<void> } } }).posDesktop.staff.refresh());
    // The owner's own shifts a previous run left open (in a browser or on a till) are closed.
    for (;;) {
      const { shift } = await api<{ shift: ShiftRow | null }>(page, `/shifts/current?storeId=${storeId}`);
      if (!shift) break;
      await api(page, "/shifts/close", { method: "POST", body: { storeId, shiftClientId: shift.clientId, countedCash: 0 } });
    }
    await plainLogOut(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("the owner signs in, looks at the dashboard and signs out: no cash count, no shift", async () => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("link", { name: "Reports" }).first().click();
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    expect(await localShift(page)).toBeNull();
    await plainLogOut(page);
    await login(page);
    const { shift } = await api<{ shift: ShiftRow | null }>(page, `/shifts/current?storeId=${storeId}`);
    expect(shift).toBeNull();
  });

  test("a back-office device never opens or picks up a shift, even on the POS screen; Log out stays plain", async () => {
    // A shift of the owner's left open from a browser elsewhere (the way the bug showed up).
    const stale = randomUUID();
    await api(page, "/shifts/open", { method: "POST", body: { storeId, clientId: stale, openingFloat: 0 } });

    await page.goto("app://pos/device");
    await page.getByRole("radio", { name: /^Back office/ }).check();
    await expect(page.getByText("This device is now back office")).toBeVisible();
    await page.goto("app://pos/pos");
    await expect(page.getByTestId("back-office-device")).toBeVisible();
    await expect(page.getByLabel("Opening float")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Charge/ })).toHaveCount(0);
    expect(await localShift(page)).toBeNull();
    await plainLogOut(page);

    await login(page);
    await api(page, "/shifts/close", { method: "POST", body: { storeId, shiftClientId: stale, countedCash: 0 } });
    await page.goto("app://pos/device");
    await page.getByRole("radio", { name: /^Till/ }).check();
    await expect(page.getByText("This device is now a till")).toBeVisible();
  });

  test("on a till, the shift opens when someone goes to sell, with the float; an empty shift closes in one click", async () => {
    await openPosWithProducts(page, { openShift: false });
    await page.getByLabel("Opening float").fill("50");
    await page.getByRole("button", { name: "Open the till" }).click();
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeVisible();
    const opened = (await localShift(page))!;
    await expect.poll(async () => (await api<{ shift: ShiftRow | null }>(page, `/shifts/current?storeId=${storeId}&terminalId=${await terminalId(page)}`)).shift?.clientId).toBe(opened.clientId);

    // While it's open, this device can't become back office.
    await page.goto("app://pos/device");
    await page.getByRole("radio", { name: /^Back office/ }).click();
    await expect(page.getByText("A shift is open on this device: close it first.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Till/ })).toBeChecked();

    // Nothing sold: "count = float?", one click.
    await clickLogOut(page);
    const closing = page.getByRole("dialog").filter({ hasText: "Close the till" });
    await expect(closing.getByTestId("quick-close")).toContainText("is the cash still the opening float");
    await closing.getByRole("button", { name: /^Yes, close with/ }).click();
    await page.getByRole("button", { name: "Done (sign out)" }).click();
    await page.waitForURL(/\/login/);
    await login(page);
    const closed = await api<ShiftRow>(page, `/shifts/client/${opened.clientId}?storeId=${storeId}`);
    expect(closed).toMatchObject({ status: "CLOSED", countedCash: "50", difference: "0" });
  });

  test("an empty shift can still be closed with a different amount", async () => {
    await openPosWithProducts(page, { openShift: false });
    await page.getByLabel("Opening float").fill("20");
    await page.getByRole("button", { name: "Open the till" }).click();
    const opened = (await localShift(page))!;
    await clickLogOut(page);
    const closing = page.getByRole("dialog").filter({ hasText: "Close the till" });
    await closing.getByRole("button", { name: "Enter a different amount" }).click();
    await closing.getByLabel("Cash counted").fill("15");
    await closing.getByRole("button", { name: "Close the till" }).click();
    await page.getByRole("button", { name: "Done (sign out)" }).click();
    await page.waitForURL(/\/login/);
    await login(page);
    const closed = await api<ShiftRow>(page, `/shifts/client/${opened.clientId}?storeId=${storeId}`);
    expect(closed).toMatchObject({ status: "CLOSED", countedCash: "15", difference: "-5" });
  });

  test("a shift closed from another device is forgotten here: Log out is plain", async () => {
    await openPosWithProducts(page);
    const opened = (await localShift(page))!;
    // Once the till has uploaded it, a manager closes it from elsewhere.
    await expect.poll(() => api<ShiftRow>(page, `/shifts/client/${opened.clientId}?storeId=${storeId}`).then((s) => s.status, () => null)).toBe("OPEN");
    await api(page, "/shifts/close", { method: "POST", body: { storeId, shiftClientId: opened.clientId, countedCash: 0 } });
    await page.goto("app://pos/dashboard");
    await plainLogOut(page);
    expect(await localShift(page)).toBeNull();
    await login(page);
  });

  test("a manager checking something at the cashier's till leaves the cashier's shift open", async () => {
    // The cashier takes the till and opens their shift.
    await page.goto("app://pos/pos");
    await page.getByRole("button", { name: "Lock till" }).click();
    const overlay = page.getByRole("dialog", { name: "Till locked" });
    await overlay.getByRole("button", { name: `${cashier.firstName} ${cashier.lastName}` }).click();
    await typePin(page, CASHIER_PIN);
    await expect(overlay).toBeHidden();
    await openPosWithProducts(page, { openShift: false });
    await page.getByLabel("Opening float").fill("30");
    await page.getByRole("button", { name: "Open the till" }).click();
    const cashierShift = (await localShift(page))!;
    expect(cashierShift.openedBy.id).toBe(cashier.id);

    // The owner takes over to look at something, then signs out.
    await page.getByRole("button", { name: "Lock till" }).click();
    await overlay.getByRole("button", { name: `${owner.firstName} ${owner.lastName}` }).click();
    await typePin(page, OWNER_PIN);
    await expect(overlay).toBeHidden();
    await page.goto("app://pos/dashboard");
    await plainLogOut(page);
    expect((await localShift(page))?.clientId).toBe(cashierShift.clientId);

    // The cashier comes back: same shift, still open, selling goes on.
    await expect(page.getByText("Tap your name")).toBeVisible();
    await page.getByRole("button", { name: `${cashier.firstName} ${cashier.lastName}` }).click();
    await typePin(page, CASHIER_PIN);
    await page.waitForURL(/\/pos$/);
    await openPosWithProducts(page, { openShift: false });
    await expect(page.getByRole("button", { name: /^Charge/ })).toBeVisible();
    const server = await api<ShiftRow>(page, `/shifts/client/${cashierShift.clientId}?storeId=${storeId}`);
    expect(server.status).toBe("OPEN");
    await logOut(page);
  });
});

function terminalId(page: Page) {
  return page.evaluate(async () => (await (window as unknown as { posDesktop: { terminal: { get(): Promise<{ id: string }> } } }).posDesktop.terminal.get()).id);
}
