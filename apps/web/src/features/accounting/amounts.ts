/**
 * Amounts typed in the entry form, kept as whole cents so totals never
 * pick up float errors (0.1 + 0.2).
 */

/** "1 234,56", "1.234,56", "1234.56" or "1,234.56" → 123456 cents; null if it isn't an amount with up to two decimals. */
export function parseCents(text: string): number | null {
  // \s covers the no-break spaces Intl puts in numbers (U+00A0, U+202F).
  const clean = text.replace(/\s/g, "");
  if (!clean) return 0;
  if (!/^\d[\d.,]*$/.test(clean)) return null;
  const lastDot = clean.lastIndexOf(".");
  const lastComma = clean.lastIndexOf(",");
  const decimalAt = Math.max(lastDot, lastComma);
  let whole = clean;
  let fraction = "";
  // The last separator is the decimal one when 1-2 digits follow it.
  if (decimalAt >= 0 && clean.length - decimalAt - 1 <= 2) {
    whole = clean.slice(0, decimalAt);
    fraction = clean.slice(decimalAt + 1);
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return null;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Cents as the API takes them: a number with two decimals. */
export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}

/** Cents as a plain decimal string for inputs: 123456 → "1234.56". */
export function centsToInput(cents: number): string {
  return cents ? (cents / 100).toFixed(2) : "";
}

/** "1234.56" (API) → cents. */
export function decimalToCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}
