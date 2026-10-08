export interface CurrencyOption {
  code: string;
  /** e.g. "EUR — Euro (€)" */
  label: string;
}

/**
 * Same rule as the API (common/utils/currency.ts): ISO 4217 codes with 0-2
 * decimals, because money columns are Decimal(10, 2). Sorted by name.
 */
export function supportedCurrencies(): CurrencyOption[] {
  const names = new Intl.DisplayNames(undefined, { type: "currency" });
  return Intl.supportedValuesOf("currency")
    .filter(
      (code) =>
        (new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
          .maximumFractionDigits ?? 2) <= 2,
    )
    .map((code) => {
      const name = names.of(code) ?? code;
      const symbol =
        new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
          .formatToParts(0)
          .find((p) => p.type === "currency")?.value ?? code;
      return { code, label: symbol === code ? `${code} — ${name}` : `${code} — ${name} (${symbol})` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
