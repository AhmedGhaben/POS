import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import http from "node:http";
import { API_URL, connect, launch, tempUserData } from "./helpers";

test.skip(process.env.POS_ARCHIVE_TESTS !== "1", "Requires isolated archive test API");
for (const mode of ["browser", "electron"] as const) {
  test(`${mode}: archive stock failures, retry, confirmation and deletion`, async ({ request }) => {
    expect(new URL(API_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/test/);
    const reg = await request.post(`${API_URL}/auth/register`, { data: { businessName: "Archive test", storeName: "Archive shop", firstName: "Archive", lastName: "Owner", email: `archive-${mode}-${Date.now()}@e2e.test`, password: "ArchiveTest123!", language: "en" } });
    expect(reg.status()).toBe(201);
    const session = await reg.json();
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const products: { id: string; name: string }[] = [];
    for (const name of ["Stocked archive", "Zero archive", "Delete unused"]) {
      const res = await request.post(`${API_URL}/products`, { headers, data: { sku: name, name, costPrice: 1, sellPrice: 2, exemptionCode: "M10" } });
      expect(res.status()).toBe(201); products.push(await res.json());
    }
    expect((await request.put(`${API_URL}/stores/${session.stores[0].id}/inventory/${products[0].id}`, { headers, data: { quantity: 12 } })).status()).toBe(200);
    let failure: "500" | "timeout" | "pass" | "loading" = "500";
    let release: (() => void) | undefined;
    let stockReads = 0;
    let targetId = products[0].id;
    let timedOutResponse: http.ServerResponse | undefined;
    const proxy = http.createServer(async (req, res) => {
      if (req.url === `/products/${targetId}/stock`) {
        stockReads++;
        if (failure === "500") { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: "Stock unavailable" })); return; }
        if (failure === "timeout") { timedOutResponse = res; return; } // Real application timeout, not a mocked error.
        if (failure === "loading") await new Promise<void>((resolve) => { release = resolve; });
      }
      const upstream = http.request(new URL(req.url!, API_URL), { method: req.method, headers: req.headers }, (answer) => {
        res.writeHead(answer.statusCode!, answer.headers); answer.pipe(res);
      });
      upstream.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    await new Promise<void>((resolve) => proxy.listen(55472, "127.0.0.1", resolve));
    const browser = mode === "browser" ? await chromium.launch({ channel: "msedge", headless: true }) : undefined;
    let app: ElectronApplication | undefined;
    let page: Page;
    if (browser) page = await browser.newPage();
    else { ({ app, page } = await launch(tempUserData())); await connect(page, "http://127.0.0.1:55472"); }
    try {
      const origin = mode === "browser" ? process.env.POS_TEST_WEB_URL! : "app://pos";
      await page.goto(`${origin}/login`);
      await page.evaluate((s) => {
        localStorage.setItem("pos-auth", JSON.stringify({ state: { accessToken: s.accessToken, user: s.user, business: s.business, stores: s.stores, currentStoreId: s.stores[0].id, permissions: null, offline: false }, version: 0 }));
        localStorage.setItem("pos-language", "en");
      }, session);
      await page.goto(`${origin}/products`);
      const dialog = page.getByRole("dialog");
      const archive = dialog.getByRole("button", { name: "Archive product", exact: true });
      await page.getByRole("button", { name: "Edit Stocked archive", exact: true }).click();
      await expect(dialog.getByText("Unable to verify stock. Archiving is blocked. Retry the stock lookup.")).toBeVisible();
      await expect(archive).toBeDisabled();
      failure = "timeout";
      await dialog.getByRole("button", { name: "Retry stock lookup" }).click();
      await expect.poll(() => stockReads).toBe(2);
      await expect(archive).toBeDisabled();
      await expect(dialog.getByText("Unable to verify stock. Archiving is blocked. Retry the stock lookup.")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Retry stock lookup" })).toBeEnabled();
      timedOutResponse?.destroy(); // Server recovers after the application timeout.
      failure = "loading";
      await dialog.getByRole("button", { name: "Retry stock lookup" }).click();
      await expect.poll(() => !!release).toBe(true);
      await expect(archive).toBeDisabled();
      failure = "pass"; release!();
      await expect(archive).toBeEnabled();
      await archive.click();
      await expect(dialog.getByRole("alert")).toContainText("12 in stock");
      await expect(dialog.getByRole("alert")).toContainText("Archive shop");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.getByRole("button", { name: "Delete product for good", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("can't be deleted");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Edit Stocked archive", exact: true }).click();
      await expect(archive).toBeEnabled(); await archive.click();
      // Stock changes after the user saw the confirmation: the API rejects it.
      expect((await request.put(`${API_URL}/stores/${session.stores[0].id}/inventory/${products[0].id}`, { headers, data: { quantity: 9 } })).status()).toBe(200);
      const rejected = page.waitForResponse((res) => res.url().includes(`/products/${products[0].id}`) && res.request().method() === "PATCH" && res.status() === 409);
      await dialog.getByRole("button", { name: "Archive anyway", exact: true }).click();
      await rejected;
      await expect(archive).toBeEnabled(); await archive.click();
      await expect(dialog.getByRole("alert")).toContainText("9 in stock");
      await dialog.getByRole("button", { name: "Archive anyway", exact: true }).click();
      await expect(dialog).toBeHidden();
      expect((await request.delete(`${API_URL}/products/${products[0].id}`, { headers })).status()).toBe(409);
      await page.getByRole("button", { name: "Edit Zero archive", exact: true }).click();
      await expect(archive).toBeEnabled();
      await page.keyboard.press("Escape");
      targetId = products[1].id; failure = "500";
      await page.getByRole("button", { name: "Edit Zero archive", exact: true }).click();
      await expect(dialog.getByText("Unable to verify stock. Archiving is blocked. Retry the stock lookup.")).toBeVisible();
      await expect(archive).toBeDisabled(); // Previously cached [] cannot authorize archiving.
      failure = "pass";
      await dialog.getByRole("button", { name: "Retry stock lookup" }).click();
      await expect(archive).toBeEnabled(); await archive.click();
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "Edit Delete unused", exact: true }).click();
      await dialog.getByRole("button", { name: "Delete product for good", exact: true }).click();
      await dialog.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(dialog).toBeHidden();
      const archived = await (await request.get(`${API_URL}/products?archived=true`, { headers })).json();
      expect(archived.map((p: { id: string }) => p.id).sort()).toEqual([products[0].id, products[1].id].sort());
      const active = await (await request.get(`${API_URL}/products`, { headers })).json();
      expect(active).toHaveLength(0);
    } finally { release?.(); await app?.close(); await browser?.close(); proxy.closeAllConnections(); await new Promise<void>((resolve) => proxy.close(() => resolve())); }
  });
}
