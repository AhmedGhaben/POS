import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, tempUserData } from "./helpers";

/**
 * Setting up a new till with a code (docs/plans/TILL_ESSENTIALS.md, part 5):
 * the owner gets a code in the back office, the new till takes it in the
 * setup wizard (no password typed there), goes through the hardware steps,
 * and staff sign in with their PINs.
 */
const CASHIER_PIN = "2468";

/** The owner's side, straight against the API (another computer, in real life). */
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

test.describe.serial("Till: setup with a code", () => {
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let code: string;
  let cashierName: string;

  test.beforeAll(async () => {
    const owner = await ownerApi();
    const created = await owner.call<{ code: string }>("/terminals/pairing-codes", "POST", { storeId: owner.storeId, name: "Code Till" });
    code = created.code;
    const users = await owner.call<{ id: string; email: string; firstName: string; lastName: string }[]>("/users");
    const cashier = users.find((u) => u.email === "cashier@demo-store.test")!;
    cashierName = `${cashier.firstName} ${cashier.lastName}`;
    await owner.call(`/users/${cashier.id}/pin`, "PUT", { pin: CASHIER_PIN });

    ({ app, page } = await launch(userData));
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  test("after connecting, a new till goes to the setup wizard", async () => {
    await connect(page, API_URL, { skipSetup: false });
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByText("Enter the till code")).toBeVisible();
  });

  test("a wrong code is refused; the right one registers the till", async () => {
    await page.getByLabel("Till code").fill(code === "000000" ? "000001" : "000000");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByText("That till code isn't valid or has expired")).toBeVisible();

    await page.getByLabel("Till code").fill(code);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    // On to the receipt printer; the key stayed in the Windows app.
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
    expect(await page.evaluate(() => (window as any).posDesktop.terminal.hasKey())).toBe(true);
    const terminal = await page.evaluate(() => (window as any).posDesktop.terminal.get());
    expect(terminal).toMatchObject({ name: "Code Till", code: expect.stringMatching(/^POS-\d{3}$/) });
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/[0-9a-f]{64}/);
  });

  test("printer, drawer and display steps, then sign-in with a PIN", async () => {
    await page.getByRole("button", { name: "Next" }).click(); // printer → drawer
    await expect(page.getByRole("combobox", { name: "Drawer connection" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click(); // drawer → display
    await page.getByRole("button", { name: "Next" }).click(); // display → done
    await page.getByRole("button", { name: "Go to sign-in" }).click();

    await expect(page.getByText("Tap your name")).toBeVisible();
    await page.getByRole("button", { name: cashierName }).click();
    for (const d of CASHIER_PIN) await page.keyboard.press(d);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/pos$/);
  });
});
