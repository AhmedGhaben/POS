import { AO } from "./ao";
import type { CountryConfig, IvaRegime, LineTax, TaxCode, TaxExemption, TaxRateDefault } from "./types";

export * from "./types";
export { AO } from "./ao";

/** Every country we're configured for. Adding one: a config file and an entry here. */
export const COUNTRIES: Record<string, CountryConfig> = { AO };

export function countryConfig(code: string | null | undefined): CountryConfig | null {
  return (code && COUNTRIES[code.toUpperCase()]) || null;
}

/** Exemptions offered today (confirmed, within their dates), retail ones first. */
export function activeExemptions(config: CountryConfig, taxType = "IVA", today = new Date()): TaxExemption[] {
  const day = today.toISOString().slice(0, 10);
  return config.exemptions.filter(
    (e) =>
      e.taxType === taxType &&
      !e.unconfirmed &&
      (!e.validFrom || e.validFrom <= day) &&
      (!e.validTo || e.validTo >= day),
  );
}

export function findExemption(config: CountryConfig, code: string): TaxExemption | null {
  return config.exemptions.find((e) => e.code === code) ?? null;
}

/** Rates a store may use: the regional one only where it applies (Cabinda). */
export function ratesForStore<T extends Pick<TaxRateDefault, "region">>(
  config: CountryConfig,
  rates: T[],
  storeProvince: string | null | undefined,
): T[] {
  const special = config.specialRegion;
  const inSpecial = !!special && storeProvince === special.province;
  return rates.filter((r) => r.region === config.code || (inSpecial && r.region === special!.region));
}

export function regimeConfig(config: CountryConfig, regime: IvaRegime) {
  return config.ivaRegimes.find((r) => r.code === regime) ?? null;
}

/** What a product carries: its rate and, for 0%, why. */
export interface ProductTaxFields {
  /** A number, a decimal string, or a Prisma Decimal. */
  taxRate: number | string | { toString(): string };
  taxCode?: string | null;
  exemptionCode?: string | null;
}

/**
 * The tax on a line sold in a store. In Regime Geral it's the product's own;
 * the Simplificado and Exclusão regimes make every line exempt (0%, ISE, with
 * the regime's code, M00 / M04: decision 1), whatever the product says.
 */
export function lineTax(config: CountryConfig | null, regime: IvaRegime | null | undefined, product: ProductTaxFields): LineTax {
  const exempting = config && regime ? regimeConfig(config, regime) : null;
  if (exempting && !exempting.perProductRates) {
    return { taxType: "IVA", taxCode: "ISE", rate: 0, exemptionCode: exempting.exemptionCode };
  }
  const rate = Number(product.taxRate) || 0;
  if (rate <= 0) {
    return { taxType: "IVA", taxCode: "ISE", rate: 0, exemptionCode: product.exemptionCode ?? null };
  }
  const code = (product.taxCode ?? "NOR") as TaxCode;
  return { taxType: "IVA", taxCode: code === "ISE" ? "NOR" : code, rate, exemptionCode: null };
}

/**
 * An exempt line (0%) without a known reason: no fiscal document may carry
 * one, since SAF-T and AGT need the M-code. Only in a country with an
 * exemption table.
 */
export function lacksExemptionReason(config: CountryConfig | null, tax: Pick<LineTax, "rate" | "exemptionCode">): boolean {
  if (!config || Number(tax.rate) > 0) return false;
  return !tax.exemptionCode || !findExemption(config, tax.exemptionCode);
}

/** A product that can't be sold as it is: exempt (0%) with no reason. In a regime store it'd still sell (M00/M04). */
export function productNeedsExemptionReason(config: CountryConfig | null, product: ProductTaxFields): boolean {
  return lacksExemptionReason(config, lineTax(config, null, product));
}

/** The country whose currency this is, for labelling amounts ("Kz" for AOA). */
export function countryForCurrency(currency: string | null | undefined): CountryConfig | null {
  return Object.values(COUNTRIES).find((c) => c.currency === currency) ?? null;
}

/**
 * The language of a store's documents (receipts, invoices, reports and
 * their exports, customer emails): the store's own setting ("Idioma dos
 * documentos"), else its country's (AO → pt-AO), else the business's,
 * whatever language the person at the screen reads. With no store
 * (business-wide reports), pass the business's country.
 */
export function documentLanguageFor(
  store: { documentLanguage?: string | null; country?: string | null } | null | undefined,
  businessLanguage?: string | null,
): string {
  return store?.documentLanguage || countryConfig(store?.country)?.defaultLanguage || businessLanguage || "en";
}
