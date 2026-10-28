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
  await app.evaluate(({ BrowserWindow }, { width, height }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setMinimumSize(800, 600);
    win.setContentSize(width, height);
  }, size);
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(size.width);
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
    await page.evaluate(() => localStorage.setItem("pos-language", "pt-PT"));
    await page.reload();
    await login(page);
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
});
