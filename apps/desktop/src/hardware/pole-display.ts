/**
 * 2×20 customer pole displays (VFD). Pure formatting and byte building, so
 * it's unit-tested; the bytes go out over any EscPosTransport (COM port or
 * network). Three command sets cover most models:
 * - epson:  ESC/POS display commands (Epson DM-D and compatibles)
 * - cd5220: ESC Q A / ESC Q B line commands (many generic VFDs)
 * - plain:  form feed, then 40 characters that wrap onto line 2
 */

export type PoleCommandSet = "epson" | "cd5220" | "plain";

export const POLE_WIDTH = 20;

/**
 * What the POS wants shown. Money is already formatted by the POS, so the
 * display never needs to know the currency rules.
 */
/** The pole's fixed words in the business language; English when absent (older web builds). */
export interface PoleLabels {
  total: string;
  paid: string;
  change: string;
  thanks: string;
}

export type CustomerDisplayState =
  | { mode: "idle"; message: string }
  | {
      mode: "cart";
      /** The item just added (or changed). */
      lastItem: { name: string; quantity: number; price: string } | null;
      lines: { name: string; quantity: number; total: string }[];
      itemCount: number;
      total: string;
      labels?: PoleLabels;
    }
  | { mode: "paid"; total: string; paid: string; change: string | null; labels?: PoleLabels };

const ENGLISH_LABELS: PoleLabels = { total: "TOTAL", paid: "PAID", change: "CHANGE", thanks: "THANK YOU" };

/**
 * Pole displays only show plain ASCII: accents are stripped (Café → Cafe),
 * anything else becomes "?".
 */
export function toDisplayAscii(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ | /g, " ")
    .replace(/[^\x20-\x7e]/g, "?");
}

/** One display line: label on the left, value on the right, exactly 20 wide. */
export function leftRight(label: string, value: string, width = POLE_WIDTH): string {
  const v = toDisplayAscii(value).slice(0, width);
  const room = Math.max(0, width - v.length - (v ? 1 : 0));
  const l = toDisplayAscii(label).slice(0, room);
  return (l + " ".repeat(width - l.length - v.length) + v).slice(0, width);
}

export function centered(text: string, width = POLE_WIDTH): string {
  const t = toDisplayAscii(text).trim().slice(0, width);
  const left = Math.floor((width - t.length) / 2);
  return (" ".repeat(left) + t).padEnd(width, " ");
}

/** The two 20-character lines for a state. */
export function poleLines(state: CustomerDisplayState): [string, string] {
  switch (state.mode) {
    case "idle": {
      const words = toDisplayAscii(state.message).trim();
      if (words.length <= POLE_WIDTH) return [centered(words), " ".repeat(POLE_WIDTH)];
      // Break the welcome message at a space if it doesn't fit on one line.
      const cut = words.lastIndexOf(" ", POLE_WIDTH);
      const at = cut > 0 ? cut : POLE_WIDTH;
      return [centered(words.slice(0, at)), centered(words.slice(at))];
    }
    case "cart": {
      const item = state.lastItem;
      const first = item
        ? leftRight(item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name, item.price)
        : " ".repeat(POLE_WIDTH);
      return [first, leftRight(toDisplayAscii((state.labels ?? ENGLISH_LABELS).total), state.total)];
    }
    case "paid": {
      const l = state.labels ?? ENGLISH_LABELS;
      return state.change !== null
        ? [leftRight(toDisplayAscii(l.paid), state.paid), leftRight(toDisplayAscii(l.change), state.change)]
        : [leftRight(toDisplayAscii(l.total), state.total), centered(toDisplayAscii(l.thanks))];
    }
  }
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Bytes that put the two lines on the display. */
export function poleBytes(lines: [string, string], set: PoleCommandSet): Uint8Array {
  const [a, b] = lines.map((l) => l.padEnd(POLE_WIDTH, " ").slice(0, POLE_WIDTH));
  switch (set) {
    case "epson":
      // ESC @ init, FF clear, then US $ x y to place each line.
      return concat(
        Uint8Array.of(0x1b, 0x40, 0x0c),
        Uint8Array.of(0x1f, 0x24, 1, 1),
        ascii(a),
        Uint8Array.of(0x1f, 0x24, 1, 2),
        ascii(b),
      );
    case "cd5220":
      // ESC Q A <line> CR (upper), ESC Q B <line> CR (lower).
      return concat(
        Uint8Array.of(0x1b, 0x51, 0x41),
        ascii(a),
        Uint8Array.of(0x0d, 0x1b, 0x51, 0x42),
        ascii(b),
        Uint8Array.of(0x0d),
      );
    case "plain":
      return concat(Uint8Array.of(0x0c), ascii(a + b));
  }
}
