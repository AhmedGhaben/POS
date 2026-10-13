/** Largest quantity one cart line accepts. */
export const MAX_LINE_QUANTITY = 99_999;

/**
 * A quantity typed by the cashier, or null if it isn't one. Accepts a comma
 * or a point as the decimal separator; `decimals` is how many places the
 * product's unit allows (0 for items sold by the unit).
 */
export function parseQuantity(text: string, decimals = 0): number | null {
  const t = text.trim().replace(",", ".");
  const pattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= MAX_LINE_QUANTITY ? n : null;
}

/**
 * The quantity shortcut in the search/scan field: "3*" before a barcode or
 * name adds that many at once ("3*5601234567890", "2*pão"). Without it the
 * quantity is 1.
 */
export function splitQuantityPrefix(input: string, decimals = 0): { quantity: number; query: string } {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*\*\s*(.*)$/.exec(input);
  if (!m) return { quantity: 1, query: input };
  const quantity = parseQuantity(m[1], decimals);
  return quantity === null ? { quantity: 1, query: input } : { quantity, query: m[2] };
}
