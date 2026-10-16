import { Prisma } from "@prisma/client";

/**
 * The back-office reports (docs/plans/ANGOLA.md, phase 10) as plain tables:
 * the web shows them, exports them to CSV and prints them (PDF) without
 * knowing each report. Column labels are translated on the web by `key`.
 */
export const REPORT_KEYS = [
  "salesByDay",
  "salesByMonth",
  "salesByProduct",
  "salesByCategory",
  "salesByCashier",
  "salesByPayment",
  "salesByDocumentType",
  "ivaSummary",
  "stockValuation",
  "lowStock",
  "customerBalances",
  "supplierBalances",
  "purchases",
  "agtStatus",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** Reports of the stock or balances as they are now: no period. */
export const SNAPSHOT_REPORTS: ReportKey[] = ["stockValuation", "lowStock", "customerBalances", "supplierBalances"];

/**
 * How the web shows a cell: money and quantities come as strings (exact
 * decimals); percent as a number or null; method/docType/agtStatus are
 * codes the web translates.
 */
export type ColumnKind = "text" | "date" | "month" | "money" | "quantity" | "count" | "percent" | "method" | "docType" | "agtStatus";
export type Cell = string | number | null;

export interface ReportColumn {
  key: string;
  kind: ColumnKind;
}

export interface ReportTable {
  /** A table's heading when a report has more than one (translated on the web). */
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, Cell>[];
  totals: Record<string, Cell> | null;
}

export interface ReportResult {
  report: ReportKey;
  startDate: string | null;
  endDate: string | null;
  storeId: string | null;
  tables: ReportTable[];
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO = D(0);

export function money(v: Prisma.Decimal.Value | null | undefined): string {
  return D(v ?? 0).toFixed(2);
}

export function quantity(v: Prisma.Decimal.Value | null | undefined): string {
  return D(v ?? 0)
    .toDecimalPlaces(3)
    .toString();
}

/** Margin over net sales, one decimal; null without sales. */
export function marginPercent(net: Prisma.Decimal.Value, margin: Prisma.Decimal.Value): number | null {
  const n = D(net);
  if (n.isZero()) return null;
  return D(margin).div(n).times(100).toDecimalPlaces(1).toNumber();
}

/** Sums the given money columns of the rows (kept as exact decimals). */
export function sumColumns(rows: Record<string, Cell>[], keys: string[], kind: "money" | "quantity" | "count" = "money"): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const k of keys) {
    const total = rows.reduce((acc, r) => acc.plus(D(r[k] ?? 0)), ZERO);
    out[k] = kind === "count" ? total.toNumber() : kind === "quantity" ? quantity(total) : money(total);
  }
  return out;
}

export interface PaymentEntry {
  documentType: string;
  storeId: string;
  payments: Prisma.JsonValue;
}

/**
 * Money in and out by method: Factura-Recibo payments and receipts (RC)
 * received, credit notes' refunds paid out. Same sources as the
 * accountant's "money" sheet.
 */
export function paymentsByMethod(entries: PaymentEntry[]): Map<string, { received: Prisma.Decimal; refunded: Prisma.Decimal }> {
  const out = new Map<string, { received: Prisma.Decimal; refunded: Prisma.Decimal }>();
  for (const e of entries) {
    const list = Array.isArray(e.payments) ? (e.payments as { method?: string; amount?: string | number }[]) : [];
    for (const p of list) {
      const method = p.method ?? "OTHER";
      const sum = out.get(method) ?? { received: ZERO, refunded: ZERO };
      if (e.documentType === "NC") sum.refunded = sum.refunded.plus(D(p.amount ?? 0));
      else sum.received = sum.received.plus(D(p.amount ?? 0));
      out.set(method, sum);
    }
  }
  return out;
}

/** Money actually received less refunded: the Simplificado regime's turnover. */
export function turnoverReceived(entries: PaymentEntry[]): Prisma.Decimal {
  let total = ZERO;
  for (const v of paymentsByMethod(entries).values()) total = total.plus(v.received).minus(v.refunded);
  return total;
}
