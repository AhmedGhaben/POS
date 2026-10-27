import { PaymentMethod } from "@pos/shared";
import type { SalePaymentInputDto } from "@pos/shared";
import type { PaymentDraft } from "./cart-store";

type SplitRow = PaymentDraft["rows"][number];

export type SplitStatus =
  /** Paid in full, with `changeDue` when the cash was more than the cash due. */
  | "ok"
  /** `remaining` is still to be paid. */
  | "short"
  /** The non-cash rows come to more than the total: only cash can be overpaid. */
  | "nonCashOver";

export interface SplitResult {
  payments: SalePaymentInputDto[];
  status: SplitStatus;
  remaining: number;
  changeDue: number;
}

const cents = (value: string) => Math.round((Number(value.replace(",", ".")) || 0) * 100);

/**
 * The payments a split sale sends. Only cash can be overpaid: when the cash
 * typed is more than the cash still due (the total less the other methods),
 * the cash rows become one CASH payment of what's due, with what was typed
 * as the amount tendered, and the difference is change.
 */
export function splitPayments(rows: SplitRow[], total: number): SplitResult {
  const totalCents = Math.round(total * 100);
  const nonCash = rows.filter((r) => r.method !== PaymentMethod.CASH && cents(r.amount) > 0);
  const nonCashCents = nonCash.reduce((sum, r) => sum + cents(r.amount), 0);
  const cashCents = rows.filter((r) => r.method === PaymentMethod.CASH).reduce((sum, r) => sum + Math.max(cents(r.amount), 0), 0);
  const cashDueCents = totalCents - nonCashCents;

  const nonCashPayments = nonCash.map((r) => ({ method: r.method, amount: cents(r.amount) / 100 }));
  if (cashDueCents < 0 || (cashDueCents === 0 && cashCents > 0)) {
    return { payments: nonCashPayments, status: "nonCashOver", remaining: cashDueCents / 100, changeDue: 0 };
  }
  if (cashCents < cashDueCents) {
    return { payments: [], status: "short", remaining: (cashDueCents - cashCents) / 100, changeDue: 0 };
  }

  const payments: SalePaymentInputDto[] = [];
  if (cashDueCents > 0) {
    payments.push({
      method: PaymentMethod.CASH,
      amount: cashDueCents / 100,
      ...(cashCents > cashDueCents ? { tendered: cashCents / 100 } : {}),
    });
  }
  return { payments: [...payments, ...nonCashPayments], status: "ok", remaining: 0, changeDue: (cashCents - cashDueCents) / 100 };
}

/**
 * The total shared among `payers` rows (2 to 6), to the cent: every row gets
 * the same amount and the last one the remainder. Rows already there keep
 * their method; new ones are card.
 */
export function splitEvenly(rows: SplitRow[], total: number, payers: number, newId: () => number): SplitRow[] {
  const count = Math.min(Math.max(Math.trunc(payers), 2), 6);
  const totalCents = Math.round(total * 100);
  const each = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => {
    const amount = i === count - 1 ? totalCents - each * (count - 1) : each;
    const existing = rows[i];
    return {
      id: existing?.id ?? newId(),
      method: existing?.method ?? (i === 0 ? PaymentMethod.CASH : PaymentMethod.CARD),
      amount: (amount / 100).toFixed(2),
    };
  });
}
