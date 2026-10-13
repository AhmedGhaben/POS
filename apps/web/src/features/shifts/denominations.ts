/**
 * Notes and coins for counting the drawer by denomination at close, by
 * currency (largest first). Moves into the country config in phase 7
 * (docs/plans/ANGOLA.md). A currency without a list is counted as a total.
 */
const DENOMINATIONS: Record<string, { notes: number[]; coins: number[] }> = {
  AOA: { notes: [5000, 2000, 1000, 500, 200], coins: [100, 50, 20, 10, 5, 1] },
};

export function denominationsFor(currency: string | undefined): { notes: number[]; coins: number[] } | null {
  return (currency && DENOMINATIONS[currency]) || null;
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
