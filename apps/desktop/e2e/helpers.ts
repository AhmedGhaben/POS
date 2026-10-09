import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import net from "node:net";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

export const API_URL = process.env.POS_TEST_API_URL ?? "http://localhost:4000";

/**
 * How the stand-in "server" behaves:
 * - pass: forwards to the real API
 * - bad-gateway: answers 502 like a hosting proxy whose app is down
 * - lose-responses: forwards everything, but a POST /sales never gets its
 *   answer (the API saves the sale, then the line drops), the worst moment
 *   for a connection to fail
 */
export type ProxyMode = "pass" | "bad-gateway" | "lose-responses";

/**
 * A TCP proxy in front of the API that the test can switch off or make
 * misbehave, to play "server unreachable" without touching the API process.
 */
export class SwitchableProxy {
  private server: net.Server | null = null;
  private sockets = new Set<net.Socket>();
  port = 0;
  mode: ProxyMode = "pass";

  constructor(private readonly target: URL) {}

  /** Changes behaviour for every request from now on, dropping open
   * keep-alive connections as a real outage or recovery would. */
  setMode(mode: ProxyMode) {
    this.mode = mode;
    for (const s of this.sockets) s.destroy();
  }

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  private track(s: net.Socket) {
    this.sockets.add(s);
    s.on("close", () => this.sockets.delete(s));
    s.on("error", () => s.destroy());
  }

  async up(mode: ProxyMode = "pass") {
    this.mode = mode;
    if (this.server) return;
    const server = net.createServer((client) => {
      this.track(client);
      if (this.mode === "bad-gateway") {
        client.once("data", () => {
          client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nContent-Length: 11\r\nConnection: close\r\n\r\nBad Gateway");
        });
        return;
      }
      const upstream = net.connect(Number(this.target.port || 80), this.target.hostname);
      this.track(upstream);
      // Set once this connection carries a sale while losing responses.
      let losing = false;
      client.on("data", (chunk: Buffer) => {
        if (this.mode === "lose-responses" && chunk.toString("latin1").startsWith("POST /sales")) {
          losing = true;
        }
        upstream.write(chunk);
      });
      upstream.on("data", (chunk: Buffer) => {
        if (!losing) {
          client.write(chunk);
          return;
        }
        // The API has saved the sale and is answering: cut the line instead.
        client.destroy();
        upstream.destroy();
      });
      client.on("end", () => upstream.end());
      upstream.on("end", () => client.end());
    });
    await new Promise<void>((resolve) => server.listen(this.port, "127.0.0.1", resolve));
    this.port = (server.address() as net.AddressInfo).port;
    this.server = server;
  }

  async down() {
    const server = this.server;
    this.server = null;
    for (const s of this.sockets) s.destroy();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export function tempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pos-desktop-test-"));
}

/**
 * Launches the dev build, or the packaged app when POS_DESKTOP_EXECUTABLE
 * points at it (e.g. release/win-unpacked/POS.exe).
 */
export async function launch(
  userData: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const executablePath = process.env.POS_DESKTOP_EXECUTABLE;
  const app = await electron.launch({
    ...(executablePath ? { executablePath: path.resolve(executablePath), args: [] } : { args: [path.resolve(__dirname, "..")] }),
    env: { ...process.env, POS_DESKTOP_USER_DATA: userData, ...extraEnv } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

/** Status of a refresh attempt made the same way the web app makes it. */
export function refreshStatus(page: Page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    return res.status;
  });
}

/** Signs in on the login page. */
export async function login(page: Page, email = "owner@demo-store.test", password = "OwnerPass123!") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** First-run setup: point the till at the (proxied) server. */
export async function connect(page: Page, serverUrl: string) {
  await page.getByLabel("Server address").fill(serverUrl);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.waitForURL(/^app:\/\/pos\/(login|$)/);
}

/** Opens the POS and selects the first category so products are on screen. */
export async function openPosWithProducts(page: Page) {
  await page.goto("app://pos/pos");
  await page.getByRole("button", { name: "All", exact: true }).locator("xpath=following-sibling::button[1]").click();
  await page.locator("div.grid > button.text-left").first().waitFor();
}

/** Adds the first product on screen and charges it (default payment: cash). */
export async function sellFirstProduct(page: Page) {
  await page.locator("div.grid > button.text-left").first().click();
  await page.getByRole("button", { name: /^Charge/ }).click();
  await page.getByRole("dialog").waitFor();
  const text = (await page.getByRole("dialog").textContent()) ?? "";
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  return text;
}

/** Sales of the current store as the server has them (through the app's own API path). */
export function serverSales(page: Page) {
  return page.evaluate(async () => {
    const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
    const res = await fetch(`/api/sales/store/${auth.currentStoreId}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok) throw new Error(`sales list ${res.status}`);
    return (await res.json()) as { id: string; clientId: string | null; terminalId: string | null; createdOffline: boolean; receiptNumber: string }[];
  });
}

/** Outbox entries as stored on this computer, oldest first. */
export function outbox(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ clientId: string; state: string; attempts: number }[]>((resolve, reject) => {
        const req = indexedDB.open("pos-offline");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("outbox", "readonly");
          const all = tx.objectStore("outbox").getAll();
          all.onsuccess = () =>
            resolve(
              (all.result as { clientId: string; state: string; createdAt: string; attempts: number }[])
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((e) => ({ clientId: e.clientId, state: e.state, attempts: e.attempts })),
            );
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

/**
 * Tops up the signed-in store's low stock (the suites sell the same demo
 * products on every run, and an online sale with no stock is refused).
 */
export function restock(page: Page, below = 50, to = 200) {
  return page.evaluate(
    async ({ below, to }) => {
      const auth = JSON.parse(localStorage.getItem("pos-auth")!).state;
      const headers = { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" };
      const base = `/api/stores/${auth.currentStoreId}/inventory`;
      const items = (await (await fetch(base, { headers })).json()) as { productId: string; quantity: number }[];
      for (const item of items.filter((i) => i.quantity < below)) {
        await fetch(`${base}/${item.productId}`, { method: "PUT", headers, body: JSON.stringify({ quantity: to }) });
      }
    },
    { below, to },
  );
}
