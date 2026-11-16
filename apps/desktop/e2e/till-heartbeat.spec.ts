import { randomUUID } from "crypto";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, tempUserData } from "./helpers";

/**
 * "Lojas agora" (docs/brand/SYNC_STATUS_SPEC.md): a registered till reports
 * itself with its own key, so a till left on the PIN screen between
 * cashiers, with its shift open and nobody signed in, still shows online on
 * the owner's dashboard.
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

interface TillStatus {
  terminalId: string;
  status: string;
  hasOpenShift: boolean;
  appVersion: string | null;
  lastSeenAt: string | null;
}

test.describe.serial("Till heartbeat with nobody signed in", () => {
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let owner: Awaited<ReturnType<typeof ownerApi>>;
  let terminalId: string;

  test.beforeAll(async () => {
    owner = await ownerApi();
    ({ app, page } = await launch(userData));
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  test("a till registered with a code goes to the PIN screen; nobody is signed in", async () => {
    const { code } = await owner.call<{ code: string }>("/terminals/pairing-codes", "POST", { storeId: owner.storeId, name: "Heartbeat Till" });
    await connect(page, API_URL, { skipSetup: false });
    await page.getByLabel("Till code").fill(code);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Go to sign-in" }).click();
    await expect(page.getByText("Tap your name")).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth") ?? "{}")?.state?.user ?? null)).toBeNull();
    terminalId = (await page.evaluate(() => (window as any).posDesktop.terminal.get())).id;
  });

  test("with its shift open, the dashboard shows it online from its heartbeat alone", async () => {
    await owner.call("/shifts/open", "POST", { storeId: owner.storeId, terminalId, clientId: randomUUID(), openingFloat: 0 });
    const till = async () => {
      const stores = await owner.call<{ devices: TillStatus[] }[]>("/stores/status");
      return stores.flatMap((s) => s.devices).find((d) => d.terminalId === terminalId);
    };
    // The first heartbeat goes out within 15 s of start, with the app's version.
    await expect.poll(async () => (await till())?.appVersion ?? null, { timeout: 30_000 }).not.toBeNull();
    expect(await till()).toMatchObject({ status: "online", hasOpenShift: true });
    // Still nobody signed in.
    await expect(page.getByText("Tap your name")).toBeVisible();
  });
});
