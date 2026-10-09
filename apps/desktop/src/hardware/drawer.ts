import { getDrawer, getPrinting, type DrawerSettings } from "../config";
import { log } from "../logging";
import { cutCommand, openDrawerCommand } from "./escpos";
import {
  SerialTransport,
  Tcp9100Transport,
  TransportError,
  WindowsRawTransport,
  type EscPosTransport,
} from "./transports";

export type HardwareResult = { ok: true } | { ok: false; error: string };

/** The transport for the drawer as configured, or why there isn't one. */
export function drawerTransport(settings: DrawerSettings = getDrawer()): EscPosTransport | string {
  switch (settings.connection) {
    case "none":
      return "No cash drawer is set up on this till";
    case "receipt-printer": {
      const printer = getPrinting().receipt.deviceName;
      return printer ? new WindowsRawTransport(printer) : "Choose a receipt printer first (the drawer is plugged into it)";
    }
    case "windows-printer":
      return settings.printerName ? new WindowsRawTransport(settings.printerName) : "Choose the printer the drawer is plugged into";
    case "network":
      return settings.host ? new Tcp9100Transport(settings.host, settings.port) : "Enter the network printer's address";
    case "serial":
      return settings.comPort ? new SerialTransport(settings.comPort, settings.baudRate) : "Choose the drawer's COM port";
  }
}

let busy: Promise<unknown> = Promise.resolve();

/**
 * Kicks the drawer. Never throws: the result says what went wrong so the
 * page can record it with the drawer event. Calls are serialized so two
 * quick openings can't interleave bytes on the wire.
 */
export function openDrawer(): Promise<HardwareResult> {
  const run = busy.then(async (): Promise<HardwareResult> => {
    const settings = getDrawer();
    const transport = drawerTransport(settings);
    if (typeof transport === "string") return { ok: false, error: transport };
    const started = Date.now();
    try {
      await transport.send(openDrawerCommand(settings.pin, settings.pulseMs));
      log.info(`[drawer] opened via ${transport.label} (pin ${settings.pin}, ${Date.now() - started} ms)`);
      return { ok: true };
    } catch (err) {
      const error = err instanceof TransportError ? err.message : `Drawer failed: ${(err as Error).message}`;
      log.warn(`[drawer] failed via ${transport.label}: ${error}`);
      return { ok: false, error };
    }
  });
  busy = run.catch(() => undefined);
  return run;
}

/** ESC/POS cut on the receipt printer, after a receipt has printed. */
export async function cutReceiptPaper(deviceName: string): Promise<HardwareResult> {
  try {
    await new WindowsRawTransport(deviceName).send(cutCommand());
    return { ok: true };
  } catch (err) {
    log.warn(`[print] cut failed on "${deviceName}": ${(err as Error).message}`);
    return { ok: false, error: (err as Error).message };
  }
}
