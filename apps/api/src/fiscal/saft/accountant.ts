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

export interface AccountantPurchase {
  date: string;
  number: string;
  supplierDocumentNo?: string | null;
  supplierTaxId: string;
  supplierName: string;
  store: string;
  netTotal: Money;
  taxTotal: Money;
  total: Money;
  status: string;
  paymentStatus: string;
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
  return [salesSheet(input), purchasesSheet(input), movementsSheet(input)];
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
  const header = ["Data", "Compra", "Documento do fornecedor", "NIF", "Fornecedor", "Loja", "Total sem IVA", "IVA", "Total", "Estado", "Pagamento"];
  let net = ZERO;
  let tax = ZERO;
  let total = ZERO;
  const rows: XlsxCell[][] = input.purchases.map((p) => {
    net = net.plus(p.netTotal);
    tax = tax.plus(p.taxTotal);
    total = total.plus(p.total);
    return [{ date: p.date }, p.number, p.supplierDocumentNo ?? "", p.supplierTaxId, p.supplierName, p.store, amount(p.netTotal), amount(p.taxTotal), amount(p.total), p.status, p.paymentStatus];
  });
  rows.push(["Total", null, null, null, null, null, amount(net), amount(tax), amount(total), null, null]);
  return { name: "Compras", header, rows, widths: [11, 16, 22, 14, 28, 18, 14, 12, 14, 12, 16] };
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
