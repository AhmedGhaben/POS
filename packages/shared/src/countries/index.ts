import { AO } from "./ao";
import type { CountryConfig, IvaRegime, TaxExemption, TaxRateDefault } from "./types";

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
