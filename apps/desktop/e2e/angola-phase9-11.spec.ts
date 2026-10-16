import fs from "fs";
import os from "os";
import path from "path";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { API_URL, connect, launch, login, logOut, openPosWithProducts, restock, sellFirstProduct, SwitchableProxy, tempUserData } from "./helpers";

/**
 * docs/plans/ANGOLA.md, phases 9 to 11 in the app: the AGT page and its
 * switch in Settings (the test server has no AGT credentials, so sending is
 * off), the report figures with their CSV, and a person's display size
 * kept on the server across sign-ins. Puts the owner's size back to normal.
 */
test.describe.serial("Angola phases 9-11: AGT page, report figures, display size", () => {
  const proxy = new SwitchableProxy(new URL(API_URL));
  const userData = tempUserData();
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "pos-reports-"));
  let app: ElectronApplication;
  let page: Page;

  const rootFontSize = () => page.evaluate(() => document.documentElement.style.fontSize);
  const pickSize = async (name: string) => {
    await page.getByRole("button", { name: "Display size" }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };

  test.beforeAll(async () => {
    await proxy.up();
    ({ app, page } = await launch(userData));
    await connect(page, proxy.url);
    await login(page);
    await restock(page);
    // Save downloads straight into a folder instead of asking where.
    await app.evaluate(({ session }, dir) => {
      session.defaultSession.on("will-download", (_event, item) => item.setSavePath(`${dir}\\${item.getFilename()}`));
    }, downloads);
  });

  test.afterAll(async () => {
    await page
      .evaluate(async () => {
        const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
        await fetch("/api/users/me/display-size", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ displaySize: 100 }),
        });
      })
      .catch(() => {});
    await app?.close().catch(() => {});
    await proxy.down();
  });

  test("Phase 9: the AGT page says sending isn't set up on this server; Settings has the switch and a link to it", async () => {
    await page.goto("app://pos/agt");
    await expect(page.getByRole("heading", { name: "Electronic invoicing (AGT)" })).toBeVisible();
    await expect(page.getByText(/isn't set up on this server/)).toBeVisible();
    for (const k of ["QUEUED", "SENT", "VALID", "REJECTED"]) {
      await expect(page.getByTestId(`agt-count-${k}`)).toHaveText(/^\d+$/);
    }
    await page.goto("app://pos/settings");
    await expect(page.getByText("Documents are sent to AGT in real time")).toBeVisible();
    await page.getByRole("link", { name: "See what was sent to AGT" }).click();
    await expect(page).toHaveURL(/\/agt$/);
  });

  test("Phase 10: today's sale shows in Documents by type, and the figures download as CSV", async () => {
    await openPosWithProducts(page);
    await sellFirstProduct(page);
    await page.goto("app://pos/reports");
    await expect(page.getByRole("tab", { name: "Figures", selected: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Report" }).click();
    await page.getByRole("option", { name: /^Documents by type/ }).click();
    await expect(page.getByRole("heading", { name: /^Documents by type/ })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: /Factura-Recibo|FR/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "CSV" }).click();
    await expect.poll(() => fs.readdirSync(downloads).find((f) => /^salesByDocumentType_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/.test(f))).toBeTruthy();
    const file = fs.readdirSync(downloads).find((f) => f.startsWith("salesByDocumentType_"))!;
    await expect.poll(() => fs.statSync(path.join(downloads, file)).size).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(downloads, file), "utf8")).toContain("Total");
  });

  test("Phase 11: Extra large scales the screen, stays after signing out and in, and Normal puts it back", async () => {
    // On the till: its top bar has the button too, and Log out.
    await page.goto("app://pos/pos");
    expect(await rootFontSize()).toBe("");
    await pickSize("Extra large");
    await expect.poll(rootFontSize).toBe("130%");
    await logOut(page);
    // Signed out, the screen is normal size.
    await expect.poll(rootFontSize).toBe("");
    await login(page);
    await expect.poll(rootFontSize).toBe("130%");
    await pickSize("Normal");
    await expect.poll(rootFontSize).toBe("");
  });
});
