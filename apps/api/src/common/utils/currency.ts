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

/** e.g. formatMoney("12.5", "EUR") → "€12.50"; used in server-rendered emails. */
export function formatMoney(value: string | number, currency: string, locale = "en"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value));
}
