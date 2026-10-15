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
    // Tests never let the updater install anything on this PC.
    env: { ...process.env, POS_DESKTOP_USER_DATA: userData, POS_DESKTOP_UPDATE_INSTALL_ON_QUIT: "0", ...extraEnv } as Record<string, string>,
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

/**
 * Signs in on the login page. The server allows 5 sign-ins a minute, and the
 * whole suite signs in more often than that, so a "too many requests" answer
 * waits and tries again.
 */
export async function login(page: Page, email = "owner@demo-store.test", password = "OwnerPass123!") {
  // A till with PINs shows name buttons first.
  const emailLink = page.getByRole("button", { name: "Sign in with email instead" });
  await Promise.race([page.getByLabel("Email").waitFor(), emailLink.waitFor()]);
  if (await emailLink.isVisible()) await emailLink.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  for (let attempt = 0; ; attempt++) {
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const outcome = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith("/login")).then(() => "in" as const, (e: Error) => e),
      page.getByText(/Too Many Requests/i).waitFor().then(() => "throttled" as const, () => new Promise<never>(() => {})),
    ]);
    if (outcome instanceof Error) throw outcome;
    if (outcome === "in") return;
    if (attempt >= 6) throw new Error("Sign-in still rate limited");
    await page.waitForTimeout(15_000);
  }
}

/**
 * First-run setup: point the till at the (proxied) server. A new till then
 * offers the setup wizard; `skipSetup` (the default) goes straight to sign-in.
 */
export async function connect(page: Page, serverUrl: string, { skipSetup = true } = {}) {
  await page.getByLabel("Server address").fill(serverUrl);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.waitForURL(/^app:\/\/pos\/(login|setup|$)/);
  if (skipSetup && page.url().endsWith("/setup")) {
    await page.getByRole("button", { name: "Skip for now and sign in" }).click();
    await page.waitForURL(/^app:\/\/pos\/login/);
  }
}

/**
 * Opens the POS and selects the first category so products are on screen.
 * Selling needs an open shift (docs/plans/ANGOLA.md, phase 3): unless
 * `openShift: false`, the till is opened with no float if it asks.
 */
export async function openPosWithProducts(page: Page, { openShift = true } = {}) {
  await page.goto("app://pos/pos");
  await page.getByRole("button", { name: "All", exact: true }).locator("xpath=following-sibling::button[1]").click();
  await page.locator("div.grid > button.text-left").first().waitFor();
  if (openShift) await ensureShiftOpen(page);
}

/**
 * Log out. With the person's shift open, Log out goes into closing it
 * (blind count, report): count 0, close, and sign out from there.
 */
export async function logOut(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  const closing = page.getByRole("dialog").filter({ hasText: "Close the till" });
  const outcome = await Promise.race([
    page.waitForURL(/\/login/).then(() => "out" as const),
    closing.waitFor().then(() => "close" as const),
  ]);
  if (outcome === "close") {
    await closing.getByLabel("Cash counted").fill("0");
    await closing.getByRole("button", { name: "Close the till" }).click();
    await page.getByRole("button", { name: "Done (sign out)" }).click();
    await page.waitForURL(/\/login/);
  }
}

/** On the POS: opens the till with no float if it's asking for one. */
export async function ensureShiftOpen(page: Page) {
  const float = page.getByLabel("Opening float");
  const charge = page.getByRole("button", { name: /^Charge/ });
  await Promise.race([float.waitFor(), charge.waitFor()]);
  if (await float.isVisible()) {
    await float.fill("0");
    await page.getByRole("button", { name: "Open the till" }).click();
    await charge.waitFor();
  }
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
      new Promise<{ clientId: string; kind: string; state: string; attempts: number }[]>((resolve, reject) => {
        const req = indexedDB.open("pos-offline");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("outbox", "readonly");
          const all = tx.objectStore("outbox").getAll();
          all.onsuccess = () =>
            resolve(
              (all.result as { clientId: string; kind: string; state: string; createdAt: string; attempts: number }[])
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((e) => ({ clientId: e.clientId, kind: e.kind, state: e.state, attempts: e.attempts })),
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
      const items = (await (await fetch(base, { headers })).json()) as { productId: string; quantity: string }[];
      // Products added by hand may have no stock row in this store at all.
      const products = (await (await fetch("/api/products", { headers })).json()) as { id: string }[];
      const stock = new Map(items.map((i) => [i.productId, Number(i.quantity)]));
      for (const { id } of products) {
        if ((stock.get(id) ?? 0) >= below) continue;
        await fetch(`${base}/${id}`, { method: "PUT", headers, body: JSON.stringify({ quantity: to }) });
      }
    },
    { below, to },
  );
}

/**
 * Stand-in network device (receipt printer, pole display) on the shop LAN:
 * records the bytes of each connection, as hex and as text.
 */
export class FakePrinter {
  private server: net.Server | null = null;
  readonly jobs: string[] = [];
  readonly texts: string[] = [];
  port = 0;

  async start() {
    this.server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => {
        const all = Buffer.concat(chunks);
        this.jobs.push(Array.from(all, (b) => b.toString(16).padStart(2, "0")).join(" "));
        this.texts.push(all.toString("latin1"));
      });
    });
    await new Promise<void>((r) => this.server!.listen(this.port, "127.0.0.1", r));
    this.port = (this.server!.address() as net.AddressInfo).port;
  }

  async stop() {
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((r) => s.close(() => r()));
  }
}

/**
 * Registers this till (device page). In Angola a sale is a fiscal document
 * the till must sign as it issues it, so selling offline needs a registered
 * till holding its signing key (fetched with the till's key on registering).
 */
export async function registerTill(page: Page, name = `Test Till ${Date.now()}`) {
  await page.goto("app://pos/device");
  await page.getByLabel("Till name").fill(name);
  await page.getByRole("button", { name: "Register this till" }).click();
  await page.getByText(/^POS-\d{3}$/).waitFor();
  await page.waitForFunction(async () => {
    const status = await (window as unknown as { posDesktop: { signing: { status(): Promise<{ hasKey: boolean }> } } }).posDesktop.signing.status();
    return status.hasKey;
  });
}
