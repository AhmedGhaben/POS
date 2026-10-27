import { PaymentMethod, type ShiftSummaryDto } from "@pos/shared";

/**
 * Money taken this shift that never went into the drawer: sales and account
 * receipts paid by Multicaixa/TPA, transfer, mobile money… It's in the
 * sales total but not in the expected cash, which is what confuses people.
 */
export function notInDrawer(summary: ShiftSummaryDto): number {
  const cents = [summary.byMethod, summary.receipts?.byMethod ?? {}]
    .flatMap((byMethod) => Object.entries(byMethod))
    .filter(([method]) => method !== PaymentMethod.CASH)
    .reduce((sum, [, amount]) => sum + Math.round(Number(amount ?? 0) * 100), 0);
  return cents / 100;
}

/** Counted minus expected, to the cent: positive = more cash than expected ("Sobra"), negative = missing ("Falta"). */
export function cashDifference(counted: number, expected: number): number {
  // "+ 0" turns a rounded -0 into 0: balanced.
  return Math.round((counted - expected) * 100) / 100 + 0;
}
