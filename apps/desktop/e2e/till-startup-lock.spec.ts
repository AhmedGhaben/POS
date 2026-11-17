import { randomUUID } from "crypto";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, outbox, SwitchableProxy, tempUserData } from "./helpers";

/**
 * PR #15: a registered till starts locked. The session is kept between runs
 * of the app (nobody types their email and password again), but nothing
 * behind sign-in shows until someone types their PIN: not after a restart,
 * a reload, a shortcut or a navigation. Saved work keeps uploading and the
 * till keeps reporting while it's locked.
 */
const CASHIER_PIN = "2468";
const OWNER_PIN = "8642";

interface Me {
  id: string;
  firstName: string;
  lastName: string;
}

/** The owner, straight against the API (not through the till). */
async function ownerApi() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@demo-store.test", password: "OwnerPass123!" }),
  });
  const session = (await res.json()) as { accessToken: string; user: Me; stores: { id: string }[] };
  const call = async <T>(path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return (r.status === 204 ? null : await r.json()) as T;
  };
  return { user: session.user, storeId: session.stores[0].id, call };
}

function authState(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("pos-auth") ?? "{}").state as { accessToken: string | null; offline: boolean; user: Me | null },
  );
}

async function typePin(page: Page, pin: string) {
  for (const digit of pin) await page.keyboard.press(digit);
  await page.keyboard.press("Enter");
}

/**
 * Records, from the first moment of every page load, any text that only
 * shows behind sign-in (the shells' buttons, the POS's Charge button).
 */
const WATCH_PROTECTED = () => {
  const w = window as unknown as { __protectedSeen: string[] };
  w.__protectedSeen = [];
  const check = () => {
    const text = document.body?.innerText ?? "";
    const hit = /Log out|Lock till|Charge|Back to dashboard|Dashboard/.exec(text);
    if (hit) w.__protectedSeen.push(hit[0]);
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
};
const protectedSeen = (page: Page) => page.evaluate(() => (window as unknown as { __protectedSeen?: string[] }).__protectedSeen ?? []);

test.describe.serial("Till: locked at every start", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let owner: Awaited<ReturnType<typeof ownerApi>>;
  let cashier: Me;
  let terminalId: string;

  const overlay = () => page.getByRole("dialog", { name: "Till locked" });

  /** Closes the app and opens it again on the same computer (same saved data). */
  async function restart() {
    await app.close();
    ({ app, page } = await launch(userData));
    await app.context().addInitScript(WATCH_PROTECTED);
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  }

  test.beforeAll(async () => {
    owner = await ownerApi();
    const users = await owner.call<(Me & { email: string })[]>("/users");
    cashier = users.find((u) => u.email === "cashier@demo-store.test")!;
    await owner.call(`/users/${cashier.id}/pin`, "PUT", { pin: CASHIER_PIN });
    await owner.call("/users/me/pin", "PUT", { pin: OWNER_PIN, password: "OwnerPass123!" });

    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await page.goto("app://pos/device");
    await page.getByLabel("Till name").fill(`Startup Lock Till ${Date.now()}`);
    await page.getByRole("button", { name: "Register this till" }).click();
    await expect(page.getByText(/^POS-\d{3}$/)).toBeVisible();
    await page.evaluate(() => (window as any).posDesktop.staff.refresh());
    terminalId = (await page.evaluate(() => (window as any).posDesktop.terminal.get())).id;
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("1, 4: after a restart the saved session is kept, the PIN lock shows, and nothing behind it ever did", async () => {
    // Signed in and unlocked (as a manager would leave it), then the app is closed and opened again.
    await expect(page.getByText(/^POS-\d{3}$/)).toBeVisible();
    await restart();
    await expect(overlay()).toBeVisible();
    await expect(overlay()).toContainText("Tap your name");
    expect(await protectedSeen(page)).toEqual([]);
    const state = await authState(page);
    expect(state.user?.id).toBe(owner.user.id);
    expect(state.accessToken).not.toBeNull();
  });

  test("13: shortcuts and navigation don't get past the lock", async () => {
    await page.keyboard.press("Control+K");
    await page.keyboard.press("F5");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    for (const path of ["/pos", "/dashboard", "/settings", "/employees", "/device", "/shifts", "/setup"]) {
      await page.goto(`app://pos${path}`);
      await expect(overlay()).toBeVisible();
    }
    // A reload (Ctrl+R) starts the page again: still locked.
    await page.keyboard.press("Control+R");
    await page.waitForLoadState("domcontentloaded");
    await expect(overlay()).toBeVisible();
    expect(await protectedSeen(page)).toEqual([]);
  });

  test("8, 9: work saved offline survives a locked restart and uploads while it stays locked; the till keeps reporting", async () => {
    const clientId = randomUUID();
    await proxy.down();
    const storeId = await page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.currentStoreId as string);
    // A shift opening saved on the till while the server was down (as the till queues it).
    await page.evaluate(
      ({ clientId, storeId, terminalId, actingUserId }) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("pos-offline");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction("outbox", "readwrite");
            tx.objectStore("outbox").put({
              kind: "shift-open",
              clientId,
              createdAt: new Date().toISOString(),
              state: "pending",
              attempts: 0,
              payload: { storeId, clientId, terminalId, openingFloat: 0, offline: true, openedAt: new Date().toISOString(), actingUserId },
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        }),
      { clientId, storeId, terminalId, actingUserId: owner.user.id },
    );

    await restart();
    await expect(overlay()).toBeVisible();
    expect((await outbox(page)).find((e) => e.clientId === clientId)).toMatchObject({ kind: "shift-open" });
    expect((await outbox(page)).find((e) => e.clientId === clientId)?.state).not.toBe("synced");

    const restartedAt = Date.now();
    await proxy.up();
    await expect.poll(async () => (await outbox(page)).find((e) => e.clientId === clientId)?.state, { timeout: 70_000 }).toBe("synced");
    // Uploaded while still locked, and nothing behind the lock showed.
    await expect(overlay()).toBeVisible();
    expect(await protectedSeen(page)).toEqual([]);
    const shifts = await owner.call<{ items: { clientId: string; terminalId: string | null }[] }>(`/shifts?storeId=${storeId}`);
    expect(shifts.items.find((s) => s.clientId === clientId)).toMatchObject({ terminalId });

    // The owner's dashboard hears from the locked till.
    const till = async () =>
      (await owner.call<{ devices: { terminalId: string; status: string; lastSeenAt: string | null }[] }[]>("/stores/status"))
        .flatMap((s) => s.devices)
        .find((d) => d.terminalId === terminalId);
    await expect.poll(async () => new Date((await till())?.lastSeenAt ?? 0).getTime(), { timeout: 70_000 }).toBeGreaterThan(restartedAt - 1000);
    expect(["online", "syncing"]).toContain((await till())?.status);
  });

  test("5, 6, 10: a wrong PIN is refused; a different cashier unlocks with their own PIN and gets only their rights", async () => {
    await overlay().getByRole("button", { name: `${cashier.firstName} ${cashier.lastName}` }).click();
    await typePin(page, "1111");
    await expect(overlay()).toContainText("Wrong PIN");
    expect((await authState(page)).user?.id).toBe(owner.user.id);
    await typePin(page, CASHIER_PIN);
    await expect(overlay()).toBeHidden();
    await page.waitForURL(/\/pos$/);
    expect((await authState(page)).user?.id).toBe(cashier.id);
    // The owner's back office isn't the cashier's.
    await expect(page.getByRole("link", { name: "Back to dashboard" })).toHaveCount(0);
    expect((await authState(page)).user).toMatchObject({ id: cashier.id });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pos-auth")!).state.user.role)).toBe("CASHIER");
  });

  test("3: restarting an unlocked till locks it again", async () => {
    await expect(overlay()).toBeHidden();
    await restart();
    await expect(overlay()).toBeVisible();
    expect(await protectedSeen(page)).toEqual([]);
    expect((await authState(page)).user?.id).toBe(cashier.id);
  });

  test("2: closing and opening a locked till again keeps it locked", async () => {
    await restart();
    await expect(overlay()).toBeVisible();
    await restart();
    await expect(overlay()).toBeVisible();
    expect(await protectedSeen(page)).toEqual([]);
  });

  test("7: offline, the owner unlocks with the PIN checked on the till", async () => {
    await proxy.down();
    await restart();
    await overlay().getByRole("button", { name: `${owner.user.firstName} ${owner.user.lastName}` }).click();
    await typePin(page, OWNER_PIN);
    await expect(overlay()).toBeHidden();
    expect(await authState(page)).toMatchObject({ offline: true, accessToken: null, user: { id: owner.user.id } });
  });

  test("6: offline, the wrong-PIN lockout isn't reset by closing and opening the app", async () => {
    await restart();
    await overlay().getByRole("button", { name: `${cashier.firstName} ${cashier.lastName}` }).click();
    for (let i = 0; i < 5; i++) {
      await typePin(page, "0000");
      await expect(overlay()).toContainText(/Wrong PIN|Too many wrong PINs/);
    }
    await restart();
    await overlay().getByRole("button", { name: `${cashier.firstName} ${cashier.lastName}` }).click();
    await typePin(page, CASHIER_PIN);
    await expect(overlay()).toContainText("Too many wrong PINs");
    await expect(overlay()).toBeVisible();
    expect((await authState(page)).user?.id).toBe(owner.user.id);
  });

  test("12: a forgotten PIN: sign in with email and password from the lock screen", async () => {
    await proxy.up();
    await overlay().getByRole("button", { name: "Sign in with email instead" }).click();
    await page.waitForURL(/\/login/);
    await expect(page.getByLabel("Email")).toBeVisible();
    await login(page);
    await expect(overlay()).toHaveCount(0);
    expect((await authState(page)).user?.id).toBe(owner.user.id);
    expect((await authState(page)).accessToken).not.toBeNull();
  });
});
