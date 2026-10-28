import { expect, test, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, registerTill, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * Small till touchscreens (tester #14, #33, #42): 1024×768 and 1366×768,
 * in Portuguese, whose labels are the longest.
 */
const SIZES = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
];

async function resize(app: ElectronApplication, page: Page, size: { width: number; height: number }) {
  // Windows sometimes drops a resize while the window is busy: set it again until it shows.
  await expect
    .poll(async () => {
      await setSize(app, size);
      return page.evaluate(() => window.innerWidth);
    })
    .toBe(size.width);
}

function setSize(app: ElectronApplication, size: { width: number; height: number }) {
  return app.evaluate(({ BrowserWindow }, { width, height }) => {
    const win = BrowserWindow.getAllWindows().find((w) => /^app:\/\/pos\/(?!customer-display)/.test(w.webContents.getURL()))!;
    win.setKiosk(false);
    win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
    win.setMinimumSize(800, 600);
    win.setContentSize(width, height);
  }, size);
}

/** Every element inside `area` that is cut off or sticks out of it. */
function clipped(area: Locator) {
  return area.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const bad: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("button, select, input, label, p"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const name = el.textContent?.trim() || el.getAttribute("aria-label") || el.tagName;
      if (r.left < box.left - 1 || r.right > box.right + 1) bad.push(`${name}: outside the panel`);
      else if (el.scrollWidth > el.clientWidth + 1 && el.tagName !== "INPUT") bad.push(`${name}: text cut off`);
    }
    return bad;
  });
}

test.describe.serial("Small screens", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await page.evaluate(() => localStorage.setItem("pos-language", "pt-PT"));
    await page.reload();
    await restock(page);
    await registerTill(page, "Small Till");
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
    await proxy.down();
  });

  for (const size of SIZES) {
    test(`split payment fits the checkout panel at ${size.width}×${size.height}`, async () => {
      await resize(app, page, size);
      await openPosWithProducts(page);
      await page.locator("div.grid > button.text-left").first().click();
      const panel = page.getByTestId("checkout-panel");
      await page.getByRole("button", { name: /^\+ (Split payment|Dividir pagamento)/ }).click();
      expect(await clipped(panel)).toEqual([]);
      // A third payment row.
      await panel.getByRole("button", { name: /^(Add payment method|Adicionar meio de pagamento)$/ }).click();
      expect(await clipped(panel)).toEqual([]);
      await panel.getByRole("button", { name: /^(Cancel split payment|Cancelar pagamento dividido)$/ }).click();
      await page.getByRole("button", { name: /^(Clear|Limpar)/ }).click().catch(() => {});
    });
  }

  // Tester #33: the side menu stays usable on small touchscreens, also with a
  // large display size (rem grows) or Windows scaling (fewer CSS pixels).
  for (const { width, height, zoom, font } of [
    { width: 1024, height: 768, zoom: 1, font: "" },
    { width: 1280, height: 800, zoom: 1, font: "" },
    { width: 1024, height: 768, zoom: 1, font: "130%" },
    { width: 1280, height: 800, zoom: 1.25, font: "115%" },
  ]) {
    test(`back office menu at ${width}×${height}, zoom ${zoom}, text ${font || "normal"}`, async () => {
      await resize(app, page, { width, height });
      await app.evaluate(({ BrowserWindow }, z) => BrowserWindow.getAllWindows().find((w) => /^app:\/\/pos\/(?!customer-display)/.test(w.webContents.getURL()))!.webContents.setZoomFactor(z), zoom);
      for (const path of ["products", "inventory", "sales", "shifts"]) {
        await page.goto(`app://pos/${path}`);
        await page.evaluate((f) => (document.documentElement.style.fontSize = f), font);
        await page.locator("main h1").first().waitFor();
        const layout = await page.evaluate(() => {
          const aside = document.querySelector("aside")!.getBoundingClientRect();
          const main = document.querySelector("main")!.getBoundingClientRect();
          return { inner: innerWidth, scroll: document.documentElement.scrollWidth, aside, main };
        });
        // No sideways page scroll: everything fits next to the menu.
        expect(layout.scroll, path).toBeLessThanOrEqual(layout.inner);
        if (layout.aside.width > 0) {
          expect(layout.main.left, path).toBeGreaterThanOrEqual(layout.aside.right - 1);
          expect(layout.aside.width, path).toBeLessThanOrEqual(layout.inner / 4 + 1);
          await expect(page.locator("aside").getByRole("link", { name: /Point of Sale|Ponto de Venda/ })).toBeInViewport();
        } else {
          // Too narrow for a menu: the menu button opens it.
          await expect(page.getByRole("button", { name: /navigation|navegação/i })).toBeVisible();
        }
      }
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /^app:\/\/pos\/(?!customer-display)/.test(w.webContents.getURL()))!.webContents.setZoomFactor(1));
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    });
  }

  // Tester #35: from A4 there was no way back to the receipt. The toggle works
  // both ways and the till remembers it, also after a restart.
  test("Receipt / A4 toggle after a sale, remembered on this till", async () => {
    await resize(app, page, SIZES[0]);
    const sell = async () => {
      await openPosWithProducts(page);
      await page.locator("div.grid > button.text-left").first().click();
      await page.getByRole("button", { name: /^(Charge|Cobrar)/ }).click();
    };
    const complete = page.getByRole("dialog").filter({ hasText: /Sale complete|Venda concluída/ });
    const a4 = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /^(Print|Imprimir)/ }) }).filter({ hasNotText: /Sale complete|Venda concluída/ });
    const tab = (dialog: Locator, name: RegExp) => dialog.getByRole("tab", { name });

    await sell();
    await expect(tab(complete, /^(Receipt|Talão)$/)).toHaveAttribute("aria-selected", "true");
    await tab(complete, /^A4$/).click();
    await expect(complete).toBeHidden();
    await expect(tab(a4, /^A4$/)).toHaveAttribute("aria-selected", "true");
    // And back.
    await tab(a4, /^(Receipt|Talão)$/).click();
    await expect(complete).toBeVisible();
    await tab(complete, /^A4$/).click();
    await page.keyboard.press("Escape");
    await expect(a4).toBeHidden();

    // The next sale opens on A4 by itself, also after a restart.
    await page.reload();
    await sell();
    await expect(tab(a4, /^A4$/)).toHaveAttribute("aria-selected", "true");
    await tab(a4, /^(Receipt|Talão)$/).click();
    await expect(complete).toBeVisible();
    await page.keyboard.press("Escape");
    await sell();
    await expect(tab(complete, /^(Receipt|Talão)$/)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
  });
});
