/**
 * A price typed at the till: 0 or more, up to 2 decimals, comma or point.
 * A minus sign never parses, so a negative price can't be set (tester #39).
 */
export function parseLinePrice(value: string): { price: number; valid: boolean } {
  const text = value.trim();
  const price = Number(text.replace(",", "."));
  return { price, valid: text !== "" && Number.isFinite(price) && price >= 0 && /^\d+([.,]\d{1,2})?$/.test(text) };
}
