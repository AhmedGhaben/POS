import { randomUUID } from "crypto";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, ensureShiftOpen, launch, login, sellFirstProduct, serverSales, tempUserData } from "./helpers";

/**
 * A till works only in its own shift. With a browser shift of the same
 * person open in the store, a freshly started till must not pick it up
 * (it used to, when it asked before knowing which till it was): it opens its
 * own shift, and its sales and that shift carry the till.
 */
async function ownerApi() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@demo-store.test", password: "OwnerPass123!" }),
  });
  const session = (await res.json()) as { accessToken: string; stores: { id: string }[] };
  const call = async <T>(path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return (await r.json()) as T;
  };
  return { storeId: session.stores[0].id, call };
}

interface ShiftRow { id: string; clientId: string; terminalId: string | null; status: string }

test.describe.serial("Till shifts carry the till", () => {
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let owner: Awaited<ReturnType<typeof ownerApi>>;
  let browserShift: string;
  let browserSalesBefore: number;
  let terminalId: string;
  const browserSales = async () =>
    (await owner.call<{ summary: { salesCount: number } }>(`/shifts/client/${browserShift}?storeId=${owner.storeId}`)).summary.salesCount;

  test.beforeAll(async () => {
    owner = await ownerApi();
    // The owner has a browser shift open in this store (opened without a till key).
    const current = await owner.call<{ shift: ShiftRow | null }>(`/shifts/current?storeId=${owner.storeId}`);
    browserShift = current.shift?.clientId ?? randomUUID();
    if (!current.shift) await owner.call("/shifts/open", "POST", { storeId: owner.storeId, clientId: browserShift, openingFloat: 0 });
    browserSalesBefore = await browserSales();

    ({ app, page } = await launch(userData));
    const { code } = await owner.call<{ code: string }>("/terminals/pairing-codes", "POST", { storeId: owner.storeId, name: "Binding Till" });
    await connect(page, API_URL, { skipSetup: false });
    await page.getByLabel("Till code").fill(code);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Go to sign-in" }).click();
    terminalId = (await page.evaluate(() => (window as any).posDesktop.terminal.get())).id;
    await login(page);
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  test("straight to the sale screen after starting: the browser shift isn't picked up", async () => {
    // Restart and go straight to selling, before the app has read its settings.
    await app.close();
    ({ app, page } = await launch(userData));
    await page.goto("app://pos/pos");
    // It asks for an opening float (its own shift) instead of selling in the browser shift.
    await expect(page.getByLabel("Opening float")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Charge/ })).toHaveCount(0);
  });

  test("its own shift and its sale carry the till; the browser shift gets nothing", async () => {
    await page.getByRole("button", { name: "All", exact: true }).locator("xpath=following-sibling::button[1]").click();
    await page.locator("div.grid > button.text-left").first().waitFor();
    await ensureShiftOpen(page);
    await sellFirstProduct(page);

    const open = await owner.call<{ items: ShiftRow[] }>(`/shifts?storeId=${owner.storeId}&status=OPEN&terminalId=${terminalId}`);
    expect(open.items).toHaveLength(1);
    const shift = await owner.call<ShiftRow & { summary: { salesCount: number } }>(`/shifts/${open.items[0].id}`);
    expect(shift.terminalId).toBe(terminalId);
    // The sale went into the till's own shift, and it carries the till.
    expect(shift.summary.salesCount).toBe(1);
    const tillSales = (await serverSales(page)).filter((x) => x.terminalId === terminalId);
    expect(tillSales).toHaveLength(1);
    expect(await browserSales()).toBe(browserSalesBefore);

    const browser = await owner.call<{ items: (ShiftRow & { terminalExceptionCount: number })[] }>(`/shifts?storeId=${owner.storeId}&status=OPEN`);
    const stillBrowser = browser.items.find((s) => s.clientId === browserShift);
    expect(stillBrowser?.terminalId ?? null).toBeNull();
    expect(stillBrowser?.terminalExceptionCount ?? 0).toBe(0);
  });

  test("Lojas agora sees the till's open shift", async () => {
    await expect
      .poll(async () => {
        const stores = await owner.call<{ devices: { terminalId: string; hasOpenShift: boolean }[] }[]>("/stores/status");
        return stores.flatMap((s) => s.devices).find((d) => d.terminalId === terminalId)?.hasOpenShift ?? false;
      }, { timeout: 30_000 })
      .toBe(true);
  });
});
