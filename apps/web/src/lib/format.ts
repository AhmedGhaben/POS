import { countryForCurrency } from "@pos/shared";
import { currentLanguage } from "@/i18n";

const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Formats follow a language: "1.234,56 €" in Portuguese, "€1,234.56" in
 * English. `locale` defaults to the language on screen; documents for the
 * shop's customers pass the business language instead.
 */
function cached(locale: string, currency: string, options: Intl.NumberFormatOptions, kind: string) {
  const key = `${kind}|${locale}|${currency}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: "currency", currency, ...options });
    numberFormats.set(key, format);
  }
  return format;
}

/**
 * Amounts in a currency a country config labels its own way (Angola: AOA
 * printed "245 000,00 Kz", in the country's number format whatever the
 * screen language), or null for any other currency.
 */
function labelled(value: number, currency: string, options: Intl.NumberFormatOptions, kind: string): string | null {
  const country = countryForCurrency(currency);
  if (!country) return null;
  const key = `${kind}|label|${country.locale}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(country.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...options });
    numberFormats.set(key, format);
  }
  return `${format.format(value)} ${country.currencyLabel}`;
}

/** Exact amount in the business currency, with that currency's own decimals: $12.50, ¥500, 12,50 €, 245 000,00 Kz. */
export function formatMoney(value: number | string, currency: string, locale: string = currentLanguage()): string {
  return labelled(Number(value), currency, {}, "exact") ?? cached(locale, currency, {}, "exact").format(Number(value));
}

/** A quantity with up to 3 decimals, and its unit unless it's "un": 2, 0,765 kg, 1.5 l. */
export function formatQuantity(value: number | string, unit?: string | null, locale: string = currentLanguage()): string {
  const key = `qty|${locale}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    numberFormats.set(key, format);
  }
  const text = format.format(Number(value));
  return unit && unit !== "un" ? `${text} ${unit}` : text;
}

/** Auto-compact for stat tiles and chart axes: $1,284.00 / $12.9K / $4.2M. */
export function formatCurrency(value: number, currency: string, locale: string = currentLanguage()): string {
  if (Math.abs(value) < 10_000) return formatMoney(value, currency, locale);
  return (
    labelled(value, currency, { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }, "compact") ??
    cached(locale, currency, { notation: "compact", maximumFractionDigits: 1 }, "compact").format(value)
  );
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(currentLanguage(), {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(currentLanguage(), { month: "short", day: "numeric" });
}

/** Date and time, e.g. on receipts: "11/10/2026, 14:05" (pt) or "10/11/2026, 2:05 PM" (en). */
export function formatDateTime(value: string | Date, locale: string = currentLanguage()): string {
  return new Date(value).toLocaleString(locale);
}

/**
 * A calendar date ("2026-10-31") as written: the same day whatever the
 * computer's time zone (formatDate would read it as UTC midnight and show
 * the 30th west of Greenwich).
 */
export function formatCalendarDate(date: string, options: Intl.DateTimeFormatOptions = {}, locale: string = currentLanguage()): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

/** Date only; `long` gives "11 de outubro de 2026" / "October 11, 2026". */
export function formatDate(value: string | Date, locale: string = currentLanguage(), long = false): string {
  return new Date(value).toLocaleDateString(
    locale,
    long ? { day: "numeric", month: "long", year: "numeric" } : undefined,
  );
}
