/**
 * ESC/POS byte builders. Pure functions: no I/O, so they're unit-tested and
 * reused by every transport (Windows printer, network, serial).
 */

const ESC = 0x1b;
const GS = 0x1d;

export type DrawerPin = 2 | 5;

/** ESC @: reset the printer to its defaults. */
export function initialize(): Uint8Array {
  return Uint8Array.of(ESC, 0x40);
}

/**
 * ESC p m t1 t2: pulse the cash-drawer kick connector. Pin 2 is m=0, pin 5
 * is m=1. Times are in 2 ms units (max 255 = 510 ms).
 */
export function drawerKick(pin: DrawerPin = 2, onMs = 100, offMs = 500): Uint8Array {
  const units = (ms: number) => Math.max(1, Math.min(255, Math.round(ms / 2)));
  return Uint8Array.of(ESC, 0x70, pin === 5 ? 1 : 0, units(onMs), units(offMs));
}

/** ESC d n: feed n lines. */
export function feedLines(lines: number): Uint8Array {
  return Uint8Array.of(ESC, 0x64, Math.max(0, Math.min(255, Math.round(lines))));
}

/** GS V 66 n: feed n dots then cut (partial cut leaves a hinge, like most tills). */
export function feedAndCut(feedDots = 0, partial = true): Uint8Array {
  return Uint8Array.of(GS, 0x56, partial ? 66 : 65, Math.max(0, Math.min(255, Math.round(feedDots))));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** What the till sends to open the drawer. */
export function openDrawerCommand(pin: DrawerPin, pulseMs: number): Uint8Array {
  return concat(initialize(), drawerKick(pin, pulseMs, Math.max(pulseMs * 2, 200)));
}

/** Sent after a receipt when "Cut paper after receipt" is on. */
export function cutCommand(): Uint8Array {
  return concat(feedLines(3), feedAndCut(0, true));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}
