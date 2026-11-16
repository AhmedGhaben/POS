import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, tempUserData } from "./helpers";

/**
 * The red sync-error indicator on the till goes to This device → Server and
 * sync → "Sales the server refused", scrolls to the refused entry, moves the
 * keyboard focus there and outlines it briefly. Nothing is retried, deleted
 * or changed on the way.
 */
const OLD = "e2e-refused-old";
const NEW = "e2e-refused-new";

/** Two refused entries in this till's local queue (as the sync engine leaves them). */
async function addRefused(page: Page) {
  await page.evaluate(
    ([oldId, newId]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("pos-offline");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("outbox", "readwrite");
          const store = tx.objectStore("outbox");
          const base = { kind: "drawer-event", state: "failed", attempts: 3, payload: {} };
          store.put({ ...base, clientId: oldId, createdAt: "2026-11-17T09:00:00.000Z", lastError: "Shift not found" });
          store.put({ ...base, clientId: newId, createdAt: "2026-11-17T10:00:00.000Z", lastError: "Product archived" });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    [OLD, NEW],
  );
}

/** The refused entries as stored, to check nothing changed them. */
function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ clientId: string; state: string; attempts: number; lastError: string }[]>((resolve, reject) => {
        const open = indexedDB.open("pos-offline");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("outbox").objectStore("outbox").getAll();
          req.onsuccess = () =>
            resolve(
              (req.result as { clientId: string; state: string; attempts: number; lastError: string }[])
                .filter((e) => e.clientId.startsWith("e2e-refused-"))
                .map(({ clientId, state, attempts, lastError }) => ({ clientId, state, attempts, lastError })),
            );
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

const focusedEntry = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.outboxEntry ?? null);

test.describe.serial("Sync error → the refused sales", () => {
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    ({ app, page } = await launch(userData));
    await connect(page, API_URL);
    await login(page);
    await page.goto("app://pos/pos");
    await addRefused(page);
    // The till counts its queue when it starts.
    await page.reload();
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  test("the red indicator goes to the refused sales and outlines the oldest", async () => {
    const before = await stored(page);
    const indicator = page.getByRole("link", { name: /Sync error · 2 sales failed to sync/ });
    await expect(indicator).toBeVisible();
    await indicator.click();

    await expect(page).toHaveURL(/\/device#sync-refused$/);
    await expect(page.getByRole("heading", { name: /Sales the server refused/ })).toBeVisible();
    await expect.poll(() => focusedEntry(page)).toBe(OLD);
    const old = page.locator(`[data-outbox-entry="${OLD}"]`);
    await expect(old).toHaveAttribute("data-highlighted", "true");
    await expect(page.locator(`[data-outbox-entry="${NEW}"]`)).not.toHaveAttribute("data-highlighted", "true");
    await expect(old).toBeInViewport();
    // Briefly: the outline goes, the focus stays.
    await expect(old).not.toHaveAttribute("data-highlighted", "true", { timeout: 5_000 });
    expect(await focusedEntry(page)).toBe(OLD);

    // Keyboard: from the entry, Tab reaches its Retry button.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Retry");

    // Nothing retried, deleted or changed.
    expect(await stored(page)).toEqual(before);
  });

  test("a link naming an entry outlines that one, with reduced motion too", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("app://pos/pos");
    await page.goto(`app://pos/device?entry=${NEW}#sync-refused`);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await expect.poll(() => focusedEntry(page)).toBe(NEW);
    await expect(page.locator(`[data-outbox-entry="${NEW}"]`)).toHaveAttribute("data-highlighted", "true");
    expect((await stored(page)).every((e) => e.state === "failed")).toBe(true);
  });
});
