import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, openPosWithProducts, restock, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phase 8 in the app: a registered till numbers its
 * own Factura-Recibo series, online and offline; the receipt is a fiscal
 * document (number, buyer NIF, hash line, "sem validade fiscal", AGT QR);
 * the A4 copy and the documents list.
 */
async function sell(page: Page) {
  await page.locator("div.grid > button.text-left").first().click();
  await page.getByRole("button", { name: /^Charge/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Sale complete");
  return dialog;
}

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}

test.describe.serial("Angola phase 8: fiscal documents at the till", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  let app: ElectronApplication;
  let page: Page;
  let series: string;
  let originalTaxId: string | null = null;
  const patchBusiness = (body: object) =>
    page.evaluate(async (body) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const res = await fetch("/api/businesses/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as { taxId: string | null };
    }, body);

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    // The AGT QR code carries the seller's NIF.
    originalTaxId = (await patchBusiness({})).taxId;
    await patchBusiness({ taxId: "5417000000" });
    await page.goto("app://pos/device");
    await page.getByLabel("Till name").fill(`Fiscal Till ${Date.now()}`);
    await page.getByRole("button", { name: "Register this till" }).click();
    const code = (await page.getByText(/^POS-\d{3}$/).textContent())!;
    series = `${code.replace("-", "")}-${new Date().getFullYear()}`;
  });

  test.afterAll(async () => {
    proxy.setMode("pass");
    await patchBusiness({ taxId: originalTaxId ?? "" }).catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("a sale's receipt is its Factura-Recibo, numbered in this till's series", async () => {
    await openPosWithProducts(page);
    const receipt = await sell(page);
    await expect(receipt).toContainText("Factura-Recibo");
    await expect(receipt).toContainText(`FR ${series}/1`);
    await expect(receipt).toContainText("NIF: 999999999");
    // Signed on the till: the 4 hash characters lead the certification line.
    await expect(receipt).toContainText(/[^ ]{4}-Processado por programa não validado/);
    await expect(receipt).toContainText("DOCUMENTO SEM VALIDADE FISCAL");
    const qr = receipt.locator("[data-qr]").first();
    await expect(qr).toHaveAttribute("data-qr", new RegExp(`document=FR%20${series}/1$`));

    // The A4 copy is the same document, from the server.
    await receipt.getByRole("button", { name: "A4 invoice" }).click();
    const a4 = page.getByRole("dialog");
    await expect(a4).toContainText(`Factura-Recibo FR ${series}/1`);
    await expect(a4).toContainText("Consumidor Final");
    await closeDialog(page);
  });

  test("the till holds its signing key; the page can't fetch it", async () => {
    const status = await page.evaluate(() =>
      (window as unknown as { posDesktop: { signing: { status(): Promise<{ hasKey: boolean; keyVersion: string | null; secureStorage: boolean }> } } }).posDesktop.signing.status(),
    );
    expect(status).toMatchObject({ hasKey: true, keyVersion: "1", secureStorage: true });
    const blocked = await page.evaluate(async () => (await fetch("/api/fiscal-documents/signing-key")).status);
    expect(blocked).toBe(403);
  });

  test("offline, the till numbers and signs the next one: the receipt has its hash characters", async () => {
    proxy.setMode("bad-gateway");
    const receipt = await sell(page);
    await expect(receipt).toContainText("Saved offline");
    await expect(receipt).toContainText(`FR ${series}/2`);
    await expect(receipt).toContainText(/[^ ]{4}-Processado por programa não validado/);
    await expect(receipt).not.toContainText("Signature pending");
    await closeDialog(page);

    // Back online: the queue uploads it (the background sync checks every 30 s).
    proxy.setMode("pass");
    const serverNumbers = () =>
      page.evaluate(async () => {
        const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
        const res = await fetch("/api/fiscal-documents?type=FR&take=10", { headers: { Authorization: `Bearer ${auth.accessToken}` } });
        return ((await res.json()) as { items: { documentNo: string }[] }).items.map((d) => d.documentNo);
      });
    await expect.poll(serverNumbers, { timeout: 70_000 }).toContain(`FR ${series}/2`);
    // The server checked the till's signatures over the chain: no alerts.
    const alerts = await page.evaluate(async () => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const res = await fetch("/api/fiscal-documents/alerts", { headers: { Authorization: `Bearer ${auth.accessToken}` } });
      return (await res.json()) as { documentNo: string | null }[];
    });
    expect(alerts.filter((a) => a.documentNo?.includes(series))).toEqual([]);
  });

  test("the documents list shows them; the next online sale carries on at 3", async () => {
    await openPosWithProducts(page);
    const receipt = await sell(page);
    await expect(receipt).toContainText(`FR ${series}/3`);
    await closeDialog(page);

    await page.goto("app://pos/invoices");
    await expect(page.getByRole("tab", { name: "Fiscal documents" })).toBeVisible();
    await page.getByPlaceholder("Number, customer or NIF").fill(series);
    await expect(page.getByRole("row", { name: new RegExp(`FR ${series}/3`) })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`FR ${series}/1`) })).toBeVisible();
  });
});
