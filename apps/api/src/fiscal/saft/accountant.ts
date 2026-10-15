import { Prisma } from "@prisma/client";
import type { XlsxCell, XlsxSheet } from "../../common/xlsx";

/**
 * "Exportar para contabilista": the period's documents as an Excel workbook
 * an accountant can import or read: sales (one row per document, base and
 * IVA per rate), purchases, and money received and paid. Headers are in
 * Portuguese: the accountant and AGT work in it.
 */

type Money = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

export interface AccountantTax {
  /** NOR, RED, INT, ISE… */
  code: string;
  percentage: Money;
  /** AO, AO-CAB */
  region: string;
  base: Money;
  tax: Money;
  exemptionCode?: string | null;
}

export interface AccountantSale {
  date: string;
  documentNo: string;
  documentType: string;
  /** N, A */
  status: string;
  store: string;
  buyerTaxId: string;
  buyerName: string;
  taxes: AccountantTax[];
  netTotal: Money;
  taxPayable: Money;
  grossTotal: Money;
  /** Pago, Por pagar, Parcialmente pago… */
  paymentStatus: string;
}

export interface AccountantPurchaseTax {
  base: Money;
  taxAmount: Money;
  deductiblePercent: Money;
  deductibleAmount: Money;
  /** MFI, INV, OBC, SERV, IMPT, SCE */
  typology: string;
}

export interface AccountantPurchase {
  date: string;
  number: string;
  /** FT, FR, NC… as on the supplier's document. */
  supplierDocType?: string | null;
  supplierDocumentNo?: string | null;
  /** The supplier's document date (the annex and SAF-T use it). */
  supplierDocDate?: string | null;
  supplierTaxId: string;
  supplierName: string;
  store: string;
  netTotal: Money;
  taxTotal: Money;
  total: Money;
  status: string;
  paymentStatus: string;
  taxLines: AccountantPurchaseTax[];
  withholdingPercent: Money | null;
  withholdingAmount: Money;
}

export interface AccountantMoneyMovement {
  date: string;
  documentNo: string;
  /** Recebimento, Reembolso, Pagamento */
  kind: string;
  taxId: string;
  name: string;
  method: string;
  /** Money in is positive, out negative. */
  amount: Money;
}

export interface AccountantInput {
  companyName: string;
  companyTaxId: string;
  startDate: string;
  endDate: string;
  sales: AccountantSale[];
  purchases: AccountantPurchase[];
  movements: AccountantMoneyMovement[];
}

const TYPE_NAMES: Record<string, string> = { FR: "Factura-Recibo", FT: "Factura", NC: "Nota de Crédito", ND: "Nota de Débito", RC: "Recibo" };
const STATUS_NAMES: Record<string, string> = { N: "Normal", A: "Anulado" };

const amount = (v: Money) => v.toDecimalPlaces(2).toNumber();

function rateLabel(t: Pick<AccountantTax, "percentage" | "region">) {
  return `${t.percentage.toString()}%${t.region === "AO" ? "" : ` (${t.region === "AO-CAB" ? "Cabinda" : t.region})`}`;
}

/** The workbook's sheets. */
export function accountantSheets(input: AccountantInput): XlsxSheet[] {
  return [salesSheet(input), purchasesSheet(input), movementsSheet(input), supplierAnnexSheet(input)];
}

function salesSheet(input: AccountantInput): XlsxSheet {
  // One base + IVA column pair per rate charged in the period, highest rate first.
  const rates = new Map<string, Pick<AccountantTax, "percentage" | "region">>();
  for (const s of input.sales) for (const t of s.taxes) if (t.code !== "ISE" && t.percentage.gt(0)) rates.set(rateLabel(t), t);
  const rateKeys = [...rates.entries()].sort(([, a], [, b]) => b.percentage.comparedTo(a.percentage) || a.region.localeCompare(b.region)).map(([k]) => k);

  const header = [
    "Data",
    "Documento",
    "Tipo",
    "Estado",
    "Loja",
    "NIF",
    "Cliente",
    ...rateKeys.flatMap((k) => [`Base ${k}`, `IVA ${k}`]),
    "Base isenta",
    "Motivos de isenção",
    "Total sem IVA",
    "IVA",
    "Total",
    "Pagamento",
  ];
  const sums = new Array<Money>(rateKeys.length * 2 + 4).fill(ZERO);
  const rows: XlsxCell[][] = input.sales.map((s) => {
    // Annulled documents are listed (they used a number) but count for nothing;
    // credit notes take away.
    const sign = s.status === "A" ? 0 : s.documentType === "NC" ? -1 : 1;
    const perRate = rateKeys.flatMap((k) => {
      const matching = s.taxes.filter((t) => t.code !== "ISE" && t.percentage.gt(0) && rateLabel(t) === k);
      return [matching.reduce((a, t) => a.plus(t.base), ZERO), matching.reduce((a, t) => a.plus(t.tax), ZERO)];
    });
    const exempt = s.taxes.filter((t) => t.code === "ISE" || t.percentage.isZero());
    const values = [...perRate, exempt.reduce((a, t) => a.plus(t.base), ZERO), s.netTotal, s.taxPayable, s.grossTotal].map((v) => v.times(sign));
    values.forEach((v, i) => (sums[i] = sums[i].plus(v)));
    const codes = [...new Set(exempt.map((t) => t.exemptionCode).filter(Boolean))].join(", ");
    return [
      { date: s.date },
      s.documentNo,
      TYPE_NAMES[s.documentType] ?? s.documentType,
      STATUS_NAMES[s.status] ?? s.status,
      s.store,
      s.buyerTaxId,
      s.buyerName,
      ...values.slice(0, rateKeys.length * 2 + 1).map(amount),
      codes,
      ...values.slice(rateKeys.length * 2 + 1).map(amount),
      s.paymentStatus,
    ];
  });
  rows.push([
    "Total",
    null,
    null,
    null,
    null,
    null,
    null,
    ...sums.slice(0, rateKeys.length * 2 + 1).map(amount),
    null,
    ...sums.slice(rateKeys.length * 2 + 1).map(amount),
    null,
  ]);
  return { name: "Vendas", header, rows, widths: [11, 22, 16, 9, 18, 14, 28, ...rateKeys.flatMap(() => [13, 12]), 13, 16, 14, 12, 14, 16] };
}

function purchasesSheet(input: AccountantInput): XlsxSheet {
  const header = ["Data", "Compra", "Documento do fornecedor", "NIF", "Fornecedor", "Loja", "Total sem IVA", "IVA", "IVA dedutível", "IVA cativo", "Total", "Estado", "Pagamento"];
  const sums = [ZERO, ZERO, ZERO, ZERO, ZERO];
  const rows: XlsxCell[][] = input.purchases.map((p) => {
    const deductible = p.taxLines.reduce((s, t) => s.plus(t.deductibleAmount), ZERO);
    const values = [p.netTotal, p.taxTotal, deductible, p.withholdingAmount, p.total];
    values.forEach((v, i) => (sums[i] = sums[i].plus(v)));
    // "FT 12360", unless the supplier's number already starts with its type.
    const doc = p.supplierDocumentNo?.startsWith(`${p.supplierDocType} `) ? p.supplierDocumentNo : [p.supplierDocType, p.supplierDocumentNo].filter(Boolean).join(" ");
    return [{ date: p.date }, p.number, doc, p.supplierTaxId, p.supplierName, p.store, ...values.map(amount), p.status, p.paymentStatus];
  });
  rows.push(["Total", null, null, null, null, null, ...sums.map(amount), null, null]);
  return { name: "Compras", header, rows, widths: [11, 16, 24, 14, 28, 18, 14, 12, 13, 12, 14, 12, 16] };
}

/**
 * The IVA return's "Anexo de Fornecedores", as AGT's template lays it out:
 * one row per IVA base of each supplier document. The model line it goes to
 * is left for the accountant.
 */
function supplierAnnexSheet(input: AccountantInput): XlsxSheet {
  const header = [
    "Nº Ordem",
    "Nº de Identificação Fiscal",
    "Nome / Firma",
    "Tipo de Documento",
    "Data do Documento",
    "Nº do Documento",
    "Valor da Factura",
    "Valor Tributável",
    "IVA Suportado",
    "IVA Dedutível - %",
    "IVA Dedutível - Valor",
    "Tipologia",
    "IVA Cativo - %",
    "IVA Cativo - Valor",
    "Linha de destino no Modelo",
  ];
  const rows: XlsxCell[][] = [];
  for (const p of input.purchases) {
    if (!p.supplierDocumentNo || p.status === "Cancelada") continue;
    for (const t of p.taxLines) {
      if (t.taxAmount.isZero()) continue;
      // IVA cativo in proportion to this base's IVA.
      const withheld = p.taxTotal.isZero() ? ZERO : p.withholdingAmount.times(t.taxAmount).div(p.taxTotal);
      rows.push([
        { int: rows.length + 1 },
        p.supplierTaxId,
        p.supplierName,
        p.supplierDocType ?? "FT",
        { date: p.supplierDocDate ?? p.date },
        p.supplierDocumentNo,
        amount(p.total),
        amount(t.base),
        amount(t.taxAmount),
        amount(t.deductiblePercent),
        amount(t.deductibleAmount),
        t.typology,
        p.withholdingPercent ? amount(p.withholdingPercent) : 0,
        amount(withheld),
        null,
      ]);
    }
  }
  return { name: "Anexo Fornecedores", header, rows, widths: [9, 16, 28, 10, 12, 18, 14, 14, 13, 10, 13, 10, 10, 13, 12] };
}

function movementsSheet(input: AccountantInput): XlsxSheet {
  const header = ["Data", "Documento", "Movimento", "NIF", "Nome", "Meio de pagamento", "Valor"];
  let sum = ZERO;
  const rows: XlsxCell[][] = input.movements.map((m) => {
    sum = sum.plus(m.amount);
    return [{ date: m.date }, m.documentNo, m.kind, m.taxId, m.name, m.method, amount(m.amount)];
  });
  rows.push(["Total", null, null, null, null, null, amount(sum)]);
  return { name: "Recebimentos e pagamentos", header, rows, widths: [11, 22, 14, 14, 28, 22, 14] };
}
