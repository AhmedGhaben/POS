import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import net from "node:net";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

export const API_URL = process.env.POS_TEST_API_URL ?? "http://localhost:4000";

/**
 * A TCP pass-through in front of the API that the test can switch off, to
 * play "server unreachable" without touching the real API process.
 */
export class SwitchableProxy {
  private server: net.Server | null = null;
  private sockets = new Set<net.Socket>();
  port = 0;

  constructor(private readonly target: URL) {}

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  async up() {
    if (this.server) return;
    const server = net.createServer((client) => {
      const upstream = net.connect(Number(this.target.port || 80), this.target.hostname);
      for (const s of [client, upstream]) {
        this.sockets.add(s);
        s.on("close", () => this.sockets.delete(s));
        s.on("error", () => s.destroy());
      }
      client.pipe(upstream).pipe(client);
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

export async function launch(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [path.resolve(__dirname, "..")],
    env: { ...process.env, POS_DESKTOP_USER_DATA: userData } as Record<string, string>,
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
