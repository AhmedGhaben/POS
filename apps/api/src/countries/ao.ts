import { AO_IVA_EXEMPTIONS } from "./ao-exemptions";
import type { CountryConfig, TaxExemption } from "./types";

/**
 * Codes for Imposto de Selo (S01–S03) and Imposto Especial de Consumo
 * (I01–I16) exemptions, so a line can carry them later. Their official
 * texts are still to be filled in from the AGT table: until then they're
 * placeholders, marked unconfirmed, and nothing offers them.
 */
function placeholders(prefix: "S" | "I", count: number, taxType: "IS" | "IEC", tax: string): TaxExemption[] {
  return Array.from({ length: count }, (_, i) => {
    const code = `${prefix}${String(i + 1).padStart(2, "0")}`;
    return {
      code,
      taxType,
      legalText: `Isenção de ${tax} (${code})`,
      label: `Isenção de ${tax} ${code}`,
      description: `Código ${code} da tabela de isenções do ${tax} da AGT (texto oficial por confirmar).`,
      law: null,
      common: false,
      validFrom: null,
      validTo: null,
      unconfirmed: true,
    };
  });
}

/**
 * Angola (docs/plans/ANGOLA.md, phase 7 and the owner's decisions). Rates
 * are defaults: each business gets a copy its owner can edit.
 */
export const AO: CountryConfig = {
  code: "AO",
  name: "Angola",
  currency: "AOA",
  locale: "pt-AO",
  defaultLanguage: "pt-AO",
  timeZone: "Africa/Luanda",
  currencyWords: { singular: "kwanza", plural: "kwanzas", centSingular: "cêntimo", centPlural: "cêntimos" },
  // ISO 4217 is AOA (stored, exported, SAF-T CurrencyCode); printed as Kz ("AKZ" also seen on Angolan receipts).
  currencyLabel: "Kz",
  // AGT e-invoicing spec DS.120, 4.1.6 documentCancelReason (Decreto Presidencial 71/25, art. 8.º, n.ºs 8 e 9).
  annulmentReasons: {
    I: "Anulada por incorrecta identificação do adquirente",
    N: "Anulada por não ter sido enviado o documento ao adquirente",
  },
  // Alphanumeric, e.g. 000415195LA035 (companies) or 9-10 digits.
  taxIdPattern: /^[A-Z0-9]{9,14}$/i,
  taxIdLabel: "NIF",
  finalConsumerTaxId: "999999999",
  ivaRegimes: [
    { code: "GERAL", name: "Regime Geral", perProductRates: true, exemptionCode: null, turnoverRate: null },
    // Documents exempt (M00); 7% due on turnover actually received, shown in reports only.
    { code: "SIMPLIFICADO", name: "Regime Simplificado", perProductRates: false, exemptionCode: "M00", turnoverRate: 7 },
    { code: "EXCLUSAO", name: "Regime de Exclusão", perProductRates: false, exemptionCode: "M04", turnoverRate: null },
  ],
  defaultIvaRegime: "GERAL",
  taxRates: [
    { key: "IVA-NOR-14", name: "Taxa geral", taxType: "IVA", taxCode: "NOR", percentage: 14, region: "AO", isDefault: true },
    {
      key: "IVA-RED-5",
      name: "Taxa reduzida",
      taxType: "IVA",
      taxCode: "RED",
      percentage: 5,
      region: "AO",
      isDefault: false,
      note: "Cesta básica (anexo da Lei 14/23); desde o OGE 2026 também equipamento industrial vendido pelo fabricante com aprovação da AGT.",
    },
    {
      key: "IVA-INT-7",
      name: "Taxa intermédia",
      taxType: "IVA",
      taxCode: "INT",
      percentage: 7,
      region: "AO",
      isDefault: false,
      verifyValidity: true,
      note: "Serviços de hotelaria e restauração. Introduzida como medida temporária: confirmar se ainda se aplica.",
    },
    {
      key: "IVA-CAB-1",
      name: "Taxa de Cabinda",
      taxType: "IVA",
      taxCode: "RED",
      percentage: 1,
      region: "AO-CAB",
      isDefault: false,
      note: "Regime especial da província de Cabinda.",
    },
  ],
  exemptions: [...AO_IVA_EXEMPTIONS, ...placeholders("S", 3, "IS", "Imposto do Selo"), ...placeholders("I", 16, "IEC", "Imposto Especial de Consumo")],
  banks: [
    { code: "BPC", name: "Banco de Poupança e Crédito (BPC)" },
    { code: "BFA", name: "Banco de Fomento Angola (BFA)" },
    { code: "BE", name: "Banco Económico" },
    { code: "BAI", name: "Banco Angolano de Investimento (BAI)" },
    { code: "BIC", name: "Banco BIC" },
    { code: "BCA", name: "Banco Comercial Angolano (BCA)" },
    { code: "BCI", name: "Banco de Comércio e Indústria (BCI)" },
    { code: "SOL", name: "Banco Sol" },
    { code: "SCBA", name: "Standard Bank de Angola (SCBA)" },
  ],
  legalForms: [
    { code: "ENI", name: "Comerciante em nome individual" },
    { code: "LDA", name: "Sociedade por quotas (Lda)" },
    { code: "SU_LDA", name: "Sociedade unipessoal por quotas (SU, Lda)" },
    { code: "SA", name: "Sociedade anónima (SA)" },
    { code: "COOP", name: "Cooperativa" },
    { code: "SUCURSAL", name: "Sucursal / Escritório de representação" },
  ],
  // The 21 provinces since the 2024 administrative division; codes as in
  // the AGT IVA return annex where they existed (new ones to confirm).
  provinces: [
    { code: "BO", name: "Bengo" },
    { code: "BA", name: "Benguela" },
    { code: "BE", name: "Bié" },
    { code: "CA", name: "Cabinda" },
    { code: "CD", name: "Cuando" },
    { code: "CB", name: "Cubango" },
    { code: "CN", name: "Cuanza Norte" },
    { code: "CS", name: "Cuanza Sul" },
    { code: "CE", name: "Cunene" },
    { code: "HO", name: "Huambo" },
    { code: "HA", name: "Huíla" },
    { code: "IB", name: "Icolo e Bengo" },
    { code: "LA", name: "Luanda" },
    { code: "LN", name: "Lunda Norte" },
    { code: "LS", name: "Lunda Sul" },
    { code: "ME", name: "Malanje" },
    { code: "MO", name: "Moxico" },
    { code: "ML", name: "Moxico Leste" },
    { code: "NE", name: "Namibe" },
    { code: "UE", name: "Uíge" },
    { code: "ZE", name: "Zaire" },
  ],
  specialRegion: { province: "CA", region: "AO-CAB" },
  // Owner's mapping to SAF-T PaymentMechanism.
  paymentMechanisms: {
    CASH: "NU",
    CARD: "CD",
    CREDIT_CARD: "CC",
    MULTICAIXA_REFERENCE: "MB",
    BANK_TRANSFER: "TB",
    CHEQUE: "CH",
    MOBILE_MONEY: "OU",
    OTHER: "OU",
  },
  denominations: { notes: [5000, 2000, 1000, 500, 200], coins: [100, 50, 20, 10, 5, 1] },
  documentTypes: {
    FT: "Factura",
    FR: "Factura-Recibo",
    FG: "Factura Global",
    GF: "Factura Genérica",
    FA: "Factura de Adiantamento",
    AC: "Aviso de Cobrança",
    AR: "Aviso de Cobrança/Recibo",
    TV: "Talão de Venda",
    RC: "Recibo",
    RG: "Outros Recibos",
    RE: "Estorno ou Recibo de Estorno",
    ND: "Nota de Débito",
    NC: "Nota de Crédito",
    AF: "Factura/Recibo (Autofacturação)",
    RP: "Prémio ou Recibo de Prémio",
    RA: "Resseguro Aceite",
    CS: "Imputação a Co-seguradoras",
    LD: "Imputação a Co-seguradora Líder",
    PF: "Factura Pró-forma",
    OR: "Orçamento",
  },
  documentQrUrl: (issuerTaxId, documentNo) =>
    `https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=${encodeURIComponent(issuerTaxId)}&document=${documentNo.replace(/ /g, "%20")}`,
  deadlines: [
    // SAF-T (AO) Facturação, monthly while e-invoicing isn't live. Day to confirm.
    { key: "saftInvoicing", kind: "monthly", day: 15, when: "eInvoicingOff" },
    // SAF-T de Inventários: stock at 31 Dec, by 15 February.
    { key: "saftInventory", kind: "yearly", month: 2, day: 15, when: "always", regimes: ["GERAL", "SIMPLIFICADO"] },
  ],
  // SAF-T (AO) 1.01 ProductType.
  productTypes: [
    { code: "P", name: "Produtos" },
    { code: "S", name: "Serviços" },
    { code: "O", name: "Outros" },
    { code: "E", name: "Impostos Especiais de Consumo" },
    { code: "I", name: "Impostos, taxas e encargos parafiscais" },
  ],
  // Draft: the codes of the Portuguese SAF-T inventory file, until AGT's
  // Circular n.º 05/GACA/GJ/DSF/AGT/2026 gives Angola's (docs/saft-ao/README.md).
  inventoryTypes: [
    { code: "M", name: "Mercadorias" },
    { code: "P", name: "Matérias-primas, subsidiárias e de consumo" },
    { code: "A", name: "Produtos acabados e intermédios" },
    { code: "S", name: "Subprodutos, desperdícios e refugos" },
    { code: "T", name: "Produtos e trabalhos em curso" },
  ],
  inventoryTypesDraft: true,
};
