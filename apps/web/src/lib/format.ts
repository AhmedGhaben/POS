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

// Dates follow the store's country, not the language: see ./dates.
export { formatCalendarDate, formatDate, formatDateTime, formatMonth, formatShortDate } from "./dates";
