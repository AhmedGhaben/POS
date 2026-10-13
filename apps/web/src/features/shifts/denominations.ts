import { countryConfig } from "@pos/shared";

/**
 * Notes and coins for counting the drawer at close, from the store's
 * country config (largest first), when the business counts in that
 * country's currency. Otherwise the drawer is counted as a total.
 */
export function denominationsFor(
  country: string | null | undefined,
  currency: string | undefined,
): { notes: number[]; coins: number[] } | null {
  const config = countryConfig(country ?? "AO");
  return config && config.currency === currency ? config.denominations : null;
}

/** Total of a note/coin count, in the currency, exact to the cent. */
export function countTotal(counts: Record<string, number>): number {
  const cents = Object.entries(counts).reduce((sum, [value, n]) => sum + Math.round(Number(value) * 100) * (n || 0), 0);
  return cents / 100;
}

/** The count to send: whole, non-negative numbers only, zeros left out. */
export function cleanCounts(counts: Record<string, string>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [value, text] of Object.entries(counts)) {
    if (text.trim() === "") continue;
    if (!/^\d+$/.test(text.trim())) return null;
    const n = Number(text);
    if (n > 0) out[value] = n;
  }
  return out;
}
