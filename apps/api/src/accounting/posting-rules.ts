import { JournalKind, Prisma } from "@prisma/client";
import { D, LineInput, Money, ZERO } from "./entry-rules";
import { rateKey } from "./mapping";

/**
 * How each POS record becomes an entry (docs/ACCOUNTING-DECISIONS.md,
 * decisions 11-17). Pure: the integration loads the data, these say which
 * accounts move and by how much; `accounts` turns mapping keys into
 * accounts (and throws a MappingError when one is missing).
 */

export class MappingError extends Error {}

export interface AccountLookup {
  /** The account for a mapping key ("sales.goods.14"); `till` for "@till". */
  key(key: string, ctx?: { terminalId?: string | null }): string;
  customer(customerId: string): string;
  supplier(supplierId: string): string;
  /** The till's cash account (or Caixa principal). */
  till(terminalId: string | null): string;
}

export interface PostingPlan {
  journalKind: JournalKind;
  date: string;
  description: string;
  customerId?: string | null;
  supplierId?: string | null;
  lines: LineInput[];
}

/** Up to this much difference between what was paid and the document's total is rounding. */
export const ROUNDING_TOLERANCE = D(1);

export interface DocumentLineForPosting {
  netAmount: Money;
  discountAmount: Money;
  /** SAF-T product type: S is a service, everything else goods. */
  productType: string;
  taxes: { taxType: string; percentage: Money; amount: Money; exemptionCode: string | null }[];
}

export interface DocumentForPosting {
  id: string;
  documentType: string;
  documentNo: string;
  /** e.g. "Factura-Recibo" */
  typeName: string;
  date: string;
  terminalId: string | null;
  /** A named customer (never Consumidor Final). */
  customerId: string | null;
  buyerName: string;
  grossTotal: Money;
  lines: DocumentLineForPosting[];
  payments: { method: string; amount: Money }[];
  /** Cost of the goods that left (sale) or came back (credit note) with it. */
  cogs: Money;
}

const add = (lines: LineInput[], accountId: string, side: "debit" | "credit", amount: Money, description: string, sourceDocumentId?: string | null) => {
  const a = amount.toDecimalPlaces(2);
  if (a.isZero()) return;
  // A negative amount is the other side.
  const s = a.isNegative() ? (side === "debit" ? "credit" : "debit") : side;
  lines.push({ accountId, [s]: a.abs(), description, sourceDocumentId: sourceDocumentId ?? null });
};

/** Sales (and discounts, and IVA) of a document's lines, credited (or debited for a credit note). */
function salesLines(doc: DocumentForPosting, accounts: AccountLookup, out: LineInput[], creditNote: boolean, label: string) {
  const sales = new Map<string, Money>();
  const discounts = new Map<string, Money>();
  const taxes = new Map<string, Money>();
  for (const l of doc.lines) {
    const kind = l.productType === "S" ? "services" : "goods";
    const iva = l.taxes.find((t) => t.taxType === "IVA");
    const rate = iva ? rateKey(iva.percentage.toString()) : "exempt";
    const salesKey = rate === "exempt" ? (iva?.exemptionCode ? `sales.${kind}.exempt.${iva.exemptionCode}` : `sales.${kind}.exempt`) : `sales.${kind}.${rate}`;
    if (creditNote) {
      // Credit notes go to Devoluções at what was charged (after discounts).
      sales.set("sales.returns", (sales.get("sales.returns") ?? ZERO).plus(l.netAmount));
    } else {
      sales.set(salesKey, (sales.get(salesKey) ?? ZERO).plus(l.netAmount).plus(l.discountAmount));
      if (l.discountAmount.gt(0)) discounts.set(`sales.discounts.${kind}`, (discounts.get(`sales.discounts.${kind}`) ?? ZERO).plus(l.discountAmount));
    }
    for (const t of l.taxes) {
      if (t.taxType !== "IVA" || t.amount.isZero()) continue;
      const k = `${creditNote ? "iva.nc" : "iva.liquidado"}.${rateKey(t.percentage.toString())}`;
      taxes.set(k, (taxes.get(k) ?? ZERO).plus(t.amount));
    }
  }
  const salesSide = creditNote ? "debit" : "credit";
  for (const [k, v] of sales) add(out, accounts.key(k), salesSide, v, label, doc.documentNo);
  for (const [k, v] of discounts) add(out, accounts.key(k), "debit", v, label, doc.documentNo);
  for (const [k, v] of taxes) add(out, accounts.key(k), salesSide, v, label, doc.documentNo);
}

/** The cost of goods sold: out of stock on a sale, back into stock on a credit note. */
function cogsLines(doc: DocumentForPosting, accounts: AccountLookup, out: LineInput[], creditNote: boolean, label: string) {
  if (doc.cogs.isZero()) return;
  add(out, accounts.key("cogs"), creditNote ? "credit" : "debit", doc.cogs, label, doc.documentNo);
  add(out, accounts.key("stock"), creditNote ? "debit" : "credit", doc.cogs, label, doc.documentNo);
}

/** Whatever is left between both sides (cents of rounding) goes to the rounding accounts; more than that is an error. */
function balance(out: LineInput[], accounts: AccountLookup, label: string, sourceDocumentId: string) {
  const debit = out.reduce((s, l) => s.plus(D(l.debit ?? 0)), ZERO);
  const credit = out.reduce((s, l) => s.plus(D(l.credit ?? 0)), ZERO);
  const gap = debit.minus(credit);
  if (gap.isZero()) return;
  if (gap.abs().gt(ROUNDING_TOLERANCE)) {
    throw new MappingError(`${sourceDocumentId}: what was paid (${debit.toFixed(2)}) doesn't match the document (${credit.toFixed(2)})`);
  }
  if (gap.gt(0)) add(out, accounts.key("rounding.gain"), "credit", gap, label, sourceDocumentId);
  else add(out, accounts.key("rounding.loss"), "debit", gap.negated(), label, sourceDocumentId);
}

function paymentLines(doc: DocumentForPosting, accounts: AccountLookup, out: LineInput[], side: "debit" | "credit", label: string) {
  for (const p of doc.payments) {
    const account = p.method === "CASH" ? accounts.key("payment.CASH", { terminalId: doc.terminalId }) : accounts.key(`payment.${p.method}`, { terminalId: doc.terminalId });
    add(out, account, side, p.amount, label, doc.documentNo);
  }
}

/** A sales document (FR, FT, ND, NC) or a receipt (RC). */
export function documentPlan(doc: DocumentForPosting, accounts: AccountLookup): PostingPlan {
  const label = `${doc.typeName} ${doc.documentNo}${doc.buyerName ? ` – ${doc.buyerName}` : ""}`;
  const out: LineInput[] = [];
  switch (doc.documentType) {
    case "FR":
      paymentLines(doc, accounts, out, "debit", label);
      salesLines(doc, accounts, out, false, label);
      cogsLines(doc, accounts, out, false, label);
      break;
    case "FT":
    case "ND":
      if (!doc.customerId) throw new MappingError(`${doc.documentNo}: an invoice on credit needs a customer`);
      add(out, accounts.customer(doc.customerId), "debit", doc.grossTotal, label, doc.documentNo);
      salesLines(doc, accounts, out, false, label);
      cogsLines(doc, accounts, out, false, label);
      break;
    case "NC": {
      salesLines(doc, accounts, out, true, label);
      paymentLines(doc, accounts, out, "credit", label);
      // What wasn't paid back lowered the customer's debt.
      const paid = doc.payments.reduce((s, p) => s.plus(p.amount), ZERO);
      const onAccount = doc.grossTotal.minus(paid);
      if (onAccount.gt(ROUNDING_TOLERANCE)) {
        if (!doc.customerId) throw new MappingError(`${doc.documentNo}: a credit note not paid back needs a customer`);
        add(out, accounts.customer(doc.customerId), "credit", onAccount, label, doc.documentNo);
      }
      cogsLines(doc, accounts, out, true, label);
      break;
    }
    case "RC":
      if (!doc.customerId) throw new MappingError(`${doc.documentNo}: a receipt needs a customer`);
      paymentLines(doc, accounts, out, "debit", label);
      add(out, accounts.customer(doc.customerId), "credit", doc.grossTotal, label, doc.documentNo);
      break;
    default:
      throw new MappingError(`${doc.documentNo}: ${doc.documentType} documents aren't posted`);
  }
  balance(out, accounts, label, doc.documentNo);
  const cashOnly = doc.payments.length > 0 && doc.payments.every((p) => p.method === "CASH");
  return {
    journalKind: doc.documentType === "RC" ? (cashOnly ? JournalKind.CASH : JournalKind.BANK) : JournalKind.SALES,
    date: doc.date,
    description: label,
    customerId: doc.customerId,
    lines: out,
  };
}

export interface PurchaseForPosting {
  id: string;
  documentNo: string;
  supplierId: string;
  supplierName: string;
  date: string;
  /** Lines without IVA: stock (tracked products) or not (services). */
  stockAmount: Money;
  nonStockAmount: Money;
  taxLines: { taxAmount: Money; deductibleAmount: Money; typology: string }[];
  total: Money;
  withholdingAmount: Money;
}

/** A purchase: stock (or the cost), IVA deductible by type, the rest of the IVA as a cost, the supplier for the total less IVA cativo. */
export function purchasePlan(p: PurchaseForPosting, accounts: AccountLookup): PostingPlan {
  const label = `Compra ${p.documentNo} – ${p.supplierName}`;
  const out: LineInput[] = [];
  add(out, accounts.key("stock"), "debit", p.stockAmount, label, p.documentNo);
  add(out, accounts.key("purchases.nonStock"), "debit", p.nonStockAmount, label, p.documentNo);
  for (const t of p.taxLines) {
    add(out, accounts.key(`iva.dedutivel.${t.typology}`), "debit", t.deductibleAmount, label, p.documentNo);
    add(out, accounts.key("iva.naoDedutivel"), "debit", t.taxAmount.minus(t.deductibleAmount), label, p.documentNo);
  }
  add(out, accounts.supplier(p.supplierId), "credit", p.total.minus(p.withholdingAmount), label, p.documentNo);
  add(out, accounts.key("iva.cativo"), "credit", p.withholdingAmount, label, p.documentNo);
  balance(out, accounts, label, p.documentNo);
  return { journalKind: JournalKind.PURCHASES, date: p.date, description: label, supplierId: p.supplierId, lines: out };
}

/** Money paid to a supplier: their account against the bank or cash. */
export function supplierPaymentPlan(
  p: { id: string; reference: string | null; supplierId: string; supplierName: string; date: string; amount: Money; method: string },
  accounts: AccountLookup,
): PostingPlan {
  const doc = p.reference?.trim() || null;
  const label = `Pagamento a ${p.supplierName}${doc ? ` (${doc})` : ""}`;
  const out: LineInput[] = [];
  add(out, accounts.supplier(p.supplierId), "debit", p.amount, label, doc);
  add(out, p.method === "CASH" ? accounts.key("cash.main") : accounts.key(`payment.${p.method}`), "credit", p.amount, label, doc);
  return { journalKind: p.method === "CASH" ? JournalKind.CASH : JournalKind.BANK, date: p.date, description: label, supplierId: p.supplierId, lines: out };
}

/** An expense: its category's account, paid from Caixa principal (expenses have no payment method). */
export function expensePlan(e: { category: string; categoryName: string; description: string | null; date: string; amount: Money }, accounts: AccountLookup): PostingPlan {
  const label = `Despesa: ${e.categoryName}${e.description ? ` – ${e.description}` : ""}`;
  const out: LineInput[] = [];
  add(out, accounts.key(`expense.${e.category}`), "debit", e.amount, label);
  add(out, accounts.key("expense.paidFrom"), "credit", e.amount, label);
  return { journalKind: JournalKind.CASH, date: e.date, description: label, lines: out };
}

/** A shift closed with more (sobra) or less (quebra) cash than expected. */
export function shiftDifferencePlan(s: { terminalId: string | null; tillName: string; date: string; difference: Money }, accounts: AccountLookup): PostingPlan {
  const over = s.difference.gt(0);
  const label = `${over ? "Sobra" : "Quebra"} de caixa – ${s.tillName} ${s.date}`;
  const out: LineInput[] = [];
  const amount = s.difference.abs();
  if (over) {
    add(out, accounts.till(s.terminalId), "debit", amount, label);
    add(out, accounts.key("cash.over"), "credit", amount, label);
  } else {
    add(out, accounts.key("cash.short"), "debit", amount, label);
    add(out, accounts.till(s.terminalId), "credit", amount, label);
  }
  return { journalKind: JournalKind.CASH, date: s.date, description: label, lines: out };
}

/** Cash put into (IN) or taken out of (OUT) a till's drawer: between the till's cash and Caixa principal. */
export function cashMovementPlan(m: { terminalId: string | null; tillName: string; type: "IN" | "OUT"; reason: string; date: string; amount: Money }, accounts: AccountLookup): PostingPlan {
  const label = `${m.type === "OUT" ? "Saída" : "Entrada"} de caixa (${m.reason}) – ${m.tillName}`;
  const out: LineInput[] = [];
  const till = accounts.till(m.terminalId);
  const main = accounts.key("cash.main");
  add(out, m.type === "OUT" ? main : till, "debit", m.amount, label);
  add(out, m.type === "OUT" ? till : main, "credit", m.amount, label);
  return { journalKind: JournalKind.CASH, date: m.date, description: label, lines: out };
}

/** A stock count adjustment, at the average cost: found stock is a gain, missing stock a loss. */
export function stockAdjustmentPlan(a: { productName: string; storeName: string; date: string; value: Money }, accounts: AccountLookup): PostingPlan {
  const gain = a.value.gt(0);
  const label = `Acerto de inventário – ${a.productName} (${a.storeName})`;
  const out: LineInput[] = [];
  const amount = a.value.abs();
  if (gain) {
    add(out, accounts.key("stock"), "debit", amount, label);
    add(out, accounts.key("stock.gain"), "credit", amount, label);
  } else {
    add(out, accounts.key("stock.loss"), "debit", amount, label);
    add(out, accounts.key("stock"), "credit", amount, label);
  }
  return { journalKind: JournalKind.GENERAL, date: a.date, description: label, lines: out };
}

/** Lines of several plans summed per account (a till's day in one entry). */
export function sumLines(plans: PostingPlan[]): LineInput[] {
  const byAccount = new Map<string, Money>();
  for (const p of plans) {
    for (const l of p.lines) byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? ZERO).plus(D(l.debit ?? 0)).minus(D(l.credit ?? 0)));
  }
  return [...byAccount.entries()]
    .filter(([, v]) => !v.isZero())
    .map(([accountId, v]) => (v.gt(0) ? { accountId, debit: v } : { accountId, credit: v.negated() }));
}

/** The opposite of a plan's lines (an annulled document after it was posted). */
export function reversedLines(lines: LineInput[]): LineInput[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

export const decimal = (v: Prisma.Decimal.Value) => D(v);
