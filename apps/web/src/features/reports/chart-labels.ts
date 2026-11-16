import { countryForCurrency } from "@pos/shared";
import { currentLanguage } from "@/i18n";

/**
 * Chart text helpers. Display only: the data behind the charts is never
 * changed.
 */

/** A chart label that never wraps (Recharts breaks SVG text at plain spaces). */
export function noWrap(text: string): string {
  return text.replace(/ /g, " ");
}

/**
 * Short axis ticks without the currency ("12 mil", not "12 mil Kz"), in the
 * currency's own number style for currencies with one (Angola), so ticks
 * fit and match the amounts elsewhere.
 */
export function axisAmount(value: number, currency: string): string {
  const locale = countryForCurrency(currency)?.locale ?? currentLanguage();
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** A barcode or long code stuck to the end of a product name (8+ digits). */
const TRAILING_CODE = /\s*[([]?\d{8,}[)\]]?\s*$/;

/**
 * Names for the Top products chart: the product's name without a barcode
 * appended, and products that end up with the same name told apart with a
 * short suffix ("Queijo da Serra · 2").
 */
export function chartProductNames<T extends { name: string }>(items: T[]): (T & { label: string })[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = item.name.replace(TRAILING_CODE, "").trim() || item.name;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...item, label: n === 1 ? base : `${base} · ${n}` };
  });
}
