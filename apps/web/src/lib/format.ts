const moneyFormats = new Map<string, Intl.NumberFormat>();
const compactMoneyFormats = new Map<string, Intl.NumberFormat>();

function cached(map: Map<string, Intl.NumberFormat>, currency: string, options: Intl.NumberFormatOptions) {
  let format = map.get(currency);
  if (!format) {
    // `undefined` locale: the browser's, so separators match what the shop expects.
    format = new Intl.NumberFormat(undefined, { style: "currency", currency, ...options });
    map.set(currency, format);
  }
  return format;
}

/** Exact amount in the business currency, with that currency's own decimals: $12.50, ¥500, 12,50 €. */
export function formatMoney(value: number | string, currency: string): string {
  return cached(moneyFormats, currency, {}).format(Number(value));
}

/** Auto-compact for stat tiles and chart axes: $1,284.00 / $12.9K / $4.2M. */
export function formatCurrency(value: number, currency: string): string {
  if (Math.abs(value) < 10_000) return formatMoney(value, currency);
  return cached(compactMoneyFormats, currency, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-US");
}

export function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
