import { BrowserWindow, screen } from "electron";
import { z } from "zod";
import { getDisplay, type DisplaySettings } from "./config";
import type { HardwareResult } from "./hardware/drawer";
import { centered, poleBytes, poleLines, type CustomerDisplayState } from "./hardware/pole-display";
import { SerialTransport, Tcp9100Transport, type EscPosTransport } from "./hardware/transports";
import { log } from "./logging";
import { APP_ORIGIN } from "./origin";

/**
 * Customer-facing displays. The POS only ever sends an abstract state
 * (idle / cart / paid, money already formatted); this decides what the
 * attached display does with it:
 * - pole: two 20-character lines over a COM port or the network
 * - monitor: a window on the second screen showing /customer-display,
 *   which gets the same state from the POS over a BroadcastChannel
 */

const text = (max: number) => z.string().max(max);

export const displayStateSchema: z.ZodType<CustomerDisplayState> = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("idle"), message: text(80) }),
  z.object({
    mode: z.literal("cart"),
    lastItem: z.object({ name: text(200), quantity: z.number().int().min(0).max(100_000), price: text(40) }).nullable(),
    lines: z.array(z.object({ name: text(200), quantity: z.number().int().min(0).max(100_000), total: text(40) })).max(500),
    itemCount: z.number().int().min(0).max(1_000_000),
    total: text(40),
  }),
  z.object({ mode: z.literal("paid"), total: text(40), paid: text(40), change: text(40).nullable() }),
]);

function poleTransport(settings: DisplaySettings): EscPosTransport | string {
  const pole = settings.pole;
  if (pole.connection === "serial") {
    return pole.comPort ? new SerialTransport(pole.comPort, pole.baudRate) : "Choose the display's COM port";
  }
  return pole.host ? new Tcp9100Transport(pole.host, pole.port, 5000, "network display") : "Enter the display's network address";
}

// ---- pole: always show the latest state, never a backlog -----------------

let latest: CustomerDisplayState | null = null;
let writing = false;
let failing = false;

async function drainPole() {
  if (writing) return;
  writing = true;
  try {
    while (latest) {
      const state = latest;
      latest = null;
      const settings = getDisplay();
      if (settings.kind !== "pole") continue;
      const transport = poleTransport(settings);
      if (typeof transport === "string") continue;
      try {
        await transport.send(poleBytes(poleLines(state), settings.pole.commandSet));
        if (failing) log.info(`[display] ${transport.label} is working again`);
        failing = false;
      } catch (err) {
        // Log once per outage, not on every keystroke at the till.
        if (!failing) log.warn(`[display] ${(err as Error).message}`);
        failing = true;
      }
    }
  } finally {
    writing = false;
  }
}

/** Fire-and-forget: the till never waits on the customer display. */
export function showOnDisplay(state: CustomerDisplayState) {
  if (getDisplay().kind !== "pole") return;
  latest = state;
  void drainPole();
}

export async function testDisplay(): Promise<HardwareResult> {
  const settings = getDisplay();
  if (settings.kind === "monitor") {
    openCustomerWindow();
    return customerWindow ? { ok: true } : { ok: false, error: "Couldn't open the customer screen" };
  }
  if (settings.kind !== "pole") return { ok: false, error: "No customer display is set up on this till" };
  const transport = poleTransport(settings);
  if (typeof transport === "string") return { ok: false, error: transport };
  try {
    await transport.send(poleBytes([centered("POS DISPLAY TEST"), "12345678901234567890"], settings.pole.commandSet));
    log.info(`[display] test sent via ${transport.label} (${settings.pole.commandSet})`);
    return { ok: true };
  } catch (err) {
    log.warn(`[display] test failed: ${(err as Error).message}`);
    return { ok: false, error: (err as Error).message };
  }
}

// ---- monitor: a frameless window on the customer's screen -----------------

let customerWindow: BrowserWindow | null = null;

export function listScreens() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Screen ${i + 1}`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === primaryId,
  }));
}

function targetScreen(displayId: number | null) {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return all.find((d) => d.id === displayId) ?? all.find((d) => d.id !== primary.id) ?? primary;
}

export function openCustomerWindow() {
  const settings = getDisplay();
  if (settings.kind !== "monitor") return;
  const target = targetScreen(settings.monitor.displayId);
  if (customerWindow && !customerWindow.isDestroyed()) {
    // Screen changed: reopen so frame and fullscreen match the new screen.
    closeCustomerWindow();
  }
  // On a screen of its own: frameless and fullscreen. Sharing the till's
  // screen (no second monitor yet): a normal window that can be moved, so
  // it never covers the POS.
  const ownScreen = target.id !== screen.getPrimaryDisplay().id;
  customerWindow = new BrowserWindow({
    ...(ownScreen
      ? target.bounds
      : { width: 900, height: 560, x: target.workArea.x + 40, y: target.workArea.y + 40 }),
    frame: !ownScreen,
    fullscreen: ownScreen,
    autoHideMenuBar: true,
    skipTaskbar: true,
    title: "Customer display",
    backgroundColor: "#000000",
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  customerWindow.on("closed", () => {
    customerWindow = null;
  });
  void customerWindow.loadURL(`${APP_ORIGIN}/customer-display`);
  log.info(`[display] customer screen opened on ${target.label || target.id} (${target.size.width}x${target.size.height})`);
}

export function closeCustomerWindow() {
  if (customerWindow && !customerWindow.isDestroyed()) customerWindow.destroy();
  customerWindow = null;
}

/** Call after the display settings change, and once at start. */
export function applyDisplaySettings() {
  const settings = getDisplay();
  if (settings.kind === "monitor") openCustomerWindow();
  else closeCustomerWindow();
  if (settings.kind === "pole") showOnDisplay({ mode: "idle", message: settings.idleMessage });
}
