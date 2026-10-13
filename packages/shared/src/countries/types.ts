/**
 * What changes from one country to the next (docs/plans/ANGOLA.md, phase
 * 7). Keyed on the STORE's country, not the screen language. A new country
 * is a new config file, not new code paths.
 */

/** IVA regimes a store can be in. */
export type IvaRegime = "GERAL" | "SIMPLIFICADO" | "EXCLUSAO";

/** SAF-T / AGT tax codes for a rate. */
export type TaxCode = "NOR" | "RED" | "INT" | "ISE" | "OUT";

/** Taxes a document line can carry (AGT e-invoicing): IVA, Imposto de Selo, Imposto Especial de Consumo, not subject. */
export type TaxType = "IVA" | "IS" | "IEC" | "NS";

export interface IvaRegimeConfig {
  code: IvaRegime;
  /** The name the user picks, e.g. "Regime Geral". */
  name: string;
  /** Products choose their own rate (Regime Geral) … */
  perProductRates: boolean;
  /** … or every line is exempt with this code (Simplificado M00, Exclusão M04). */
  exemptionCode: string | null;
  /** IVA due on turnover actually received, for reports (Simplificado 7%). */
  turnoverRate: number | null;
}

/** A rate offered for products; seeded into each business, where the owner can edit it. */
export interface TaxRateDefault {
  /** Stable key, e.g. "IVA-NOR-14". */
  key: string;
  name: string;
  taxType: TaxType;
  taxCode: TaxCode;
  percentage: number;
  /** "AO", or "AO-CAB" for Cabinda (only offered to stores there). */
  region: string;
  isDefault: boolean;
  /** Introduced as temporary: check it still applies. */
  verifyValidity?: boolean;
  note?: string;
}

/** An exemption reason (M.. for IVA, S.. for IS, I.. for IEC). */
export interface TaxExemption {
  code: string;
  taxType: TaxType;
  /** The legal text printed on documents and sent as SAF-T TaxExemptionReason (6–60 characters). */
  legalText: string;
  /** Plain words for the dropdown, e.g. "Bens alimentares". */
  label: string;
  /** Longer description (from the AGT table). */
  description: string;
  law: string | null;
  /** Shown first in the dropdown (the ones a retail shop uses). */
  common: boolean;
  /** ISO dates; outside them the code isn't offered (kept for old documents). */
  validFrom: string | null;
  validTo: string | null;
  /** Text still to be confirmed against the official table. */
  unconfirmed?: boolean;
}

export interface BankConfig {
  code: string;
  name: string;
}

export interface LegalFormConfig {
  code: string;
  name: string;
}

/** Our payment methods → SAF-T PaymentMechanism. */
export type PaymentMechanismMap = Record<string, string>;

export interface ProvinceConfig {
  code: string;
  name: string;
}

export interface DeadlineConfig {
  key: string;
  /** "monthly" (day of the next month) or "yearly" (month/day of the next year). */
  kind: "monthly" | "yearly";
  day: number;
  /** 1-12, for yearly. */
  month?: number;
  /** When it applies. */
  when: "always" | "eInvoicingOff";
  regimes?: IvaRegime[];
}

export interface CountryConfig {
  code: string;
  name: string;
  currency: string;
  /** Locale for numbers, money and dates on documents (e.g. "pt-AO": 245 000,00 Kz). */
  locale: string;
  /** Screen/document language for new businesses here. */
  defaultLanguage: string;
  /** Tax ID pattern (alphanumeric in Angola, e.g. 000415195LA035). */
  taxIdPattern: RegExp;
  taxIdLabel: string;
  /** The tax ID used for anonymous buyers (Consumidor Final). */
  finalConsumerTaxId: string;
  ivaRegimes: IvaRegimeConfig[];
  defaultIvaRegime: IvaRegime;
  taxRates: TaxRateDefault[];
  exemptions: TaxExemption[];
  banks: BankConfig[];
  legalForms: LegalFormConfig[];
  provinces: ProvinceConfig[];
  /** Province code where the regional rate applies (Cabinda). */
  specialRegion: { province: string; region: string } | null;
  paymentMechanisms: PaymentMechanismMap;
  /** Notes and coins, largest first, for counting the drawer. */
  denominations: { notes: number[]; coins: number[] };
  /** AGT document types: code → name. */
  documentTypes: Record<string, string>;
  /** Link encoded in the document QR code. */
  documentQrUrl: (issuerTaxId: string, documentNo: string) => string;
  deadlines: DeadlineConfig[];
  /** SAF-T ProductType: P products, S services, O other, E excise, I other taxes. */
  productTypes: { code: SaftProductType; name: string }[];
  /** Inventory product types for the yearly inventory file. */
  inventoryTypes: { code: string; name: string }[];
  /** The inventory types are our best guess until the official list is published. */
  inventoryTypesDraft: boolean;
}

export type SaftProductType = "P" | "S" | "O" | "E" | "I";

/** The tax that applies to one line: the product's, unless the store's regime exempts everything. */
export interface LineTax {
  taxType: TaxType;
  taxCode: TaxCode;
  /** Percent, e.g. 14. */
  rate: number;
  /** Exemption code (e.g. M00) when the rate is 0. */
  exemptionCode: string | null;
}
