import { PaymentMethod, SaleStatus, type CashMovementReason, type SaleDto, type ShiftSummaryDto } from "@pos/shared";

/**
 * The till's own record of its open shift, so it can work out the expected
 * cash and print the report even while offline. The server keeps the real
 * record; at close, both figures are kept.
 */
export interface LedgerSale {
  /** The sale's clientId (or id for sales without one). */
  key: string;
  total: number;
  discount: number;
  cashierId: string;
  cashier: string;
  payments: { method: PaymentMethod; amount: number }[];
  voided: boolean;
}

export interface LedgerMovement {
  clientId: string;
  type: "IN" | "OUT";
  amount: number;
  reason: CashMovementReason;
  note: string | null;
  occurredAt: string;
  user: string;
}

export interface LocalShift {
  clientId: string;
  storeId: string;
  terminalId: string | null;
  openedAt: string;
  openingFloat: number;
  openedBy: { id: string; name: string };
  sales: LedgerSale[];
  movements: LedgerMovement[];
  /**
   * Opened on another device or before this till kept a record: its own
   * figures would be incomplete, so the server's are used.
   */
  adopted?: boolean;
}

export function ledgerSale(sale: SaleDto, cashierName: string): LedgerSale {
  return {
    key: sale.clientId ?? sale.id,
    total: Number(sale.total),
    discount: Number(sale.discountTotal),
    cashierId: sale.cashierId,
    cashier: cashierName,
    payments: sale.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
    voided: sale.status === SaleStatus.VOIDED,
  };
}

const cents = (n: number) => Math.round(n * 100);
const money = (c: number) => (c / 100).toFixed(2);

/** The same report the server makes, from the till's own record (no returns: they're done in the back office). */
export function localSummary(shift: LocalShift): ShiftSummaryDto {
  const completed = shift.sales.filter((s) => !s.voided);
  const voided = shift.sales.filter((s) => s.voided);
  const byMethod = new Map<PaymentMethod, number>();
  for (const s of completed) for (const p of s.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + cents(p.amount));
  const byCashier = new Map<string, { id: string; name: string; count: number; total: number }>();
  for (const s of completed) {
    const row = byCashier.get(s.cashierId) ?? { id: s.cashierId, name: s.cashier, count: 0, total: 0 };
    row.count++;
    row.total += cents(s.total);
    byCashier.set(s.cashierId, row);
  }
  const total = (list: { amount: number }[]) => list.reduce((a, m) => a + cents(m.amount), 0);
  const cashIn = total(shift.movements.filter((m) => m.type === "IN"));
  const cashOut = total(shift.movements.filter((m) => m.type === "OUT"));
  const cash = byMethod.get(PaymentMethod.CASH) ?? 0;

  return {
    salesCount: completed.length,
    salesTotal: money(completed.reduce((a, s) => a + cents(s.total), 0)),
    byMethod: Object.fromEntries([...byMethod].map(([m, c]) => [m, money(c)])),
    discounts: money(completed.reduce((a, s) => a + cents(s.discount), 0)),
    voided: { count: voided.length, total: money(voided.reduce((a, s) => a + cents(s.total), 0)) },
    returns: { count: 0, total: "0.00", cash: "0.00" },
    cashIn: money(cashIn),
    cashOut: money(cashOut),
    movements: shift.movements.map((m) => ({
      id: m.clientId,
      type: m.type,
      amount: m.amount.toFixed(2),
      reason: m.reason,
      note: m.note,
      occurredAt: m.occurredAt,
      user: m.user,
    })),
    byCashier: [...byCashier.values()].map((r) => ({ ...r, total: money(r.total) })),
    expectedCash: money(cents(shift.openingFloat) + cash + cashIn - cashOut),
  };
}
