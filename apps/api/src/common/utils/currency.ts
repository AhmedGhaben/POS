import { countryForCurrency } from "../../countries";

/**
 * ISO 4217 codes a business may pick: every currency the runtime knows whose
 * minor unit is 0-2 digits. Money columns are Decimal(10, 2), so 3-decimal
 * currencies (TND, KWD, BHD, OMR, JOD...) can't be stored exactly.
 */
export const SUPPORTED_CURRENCIES: string[] = Intl.supportedValuesOf("currency").filter(
  (code) =>
    (new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2) <= 2,
);

/**
 * e.g. formatMoney("12.5", "EUR") → "€12.50"; used in server-rendered emails.
 * A currency a country labels its own way prints like the web app's: AOA is
 * "245 000,00 Kz" (apps/web/src/lib/format.ts).
 */
export function formatMoney(value: string | number, currency: string, locale = "en"): string {
  const country = countryForCurrency(currency);
  if (country) {
    const amount = new Intl.NumberFormat(country.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
    return `${amount} ${country.currencyLabel}`;
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value));
}
