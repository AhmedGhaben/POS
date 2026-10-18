import { Prisma } from "@prisma/client";

/**
 * Year-end rules (docs/ACCOUNTING-DECISIONS.md, decision 20). The apuramento
 * moves each income and cost account (classes 6 and 7) into the result of
 * its nature (82-86); then 82-87 go into 88, the year's net result.
 */

/** Where an account of class 6 or 7 is closed, by its first-degree account. */
export function resultAccountFor(code: string): string | null {
  const first = Number(code.split(".")[0]);
  if (first < 61 || first > 79) return null;
  const nature = first % 10; // 61 and 71 → 1 …
  if (nature >= 1 && nature <= 5) return "82.1"; // operational (61-65, 71-75)
  if (nature === 6) return "83.1"; // financial
  if (nature === 7) return "84.1"; // subsidiaries and associates
  if (nature === 8) return "85.1"; // non-operating
  if (nature === 9) return "86.1"; // extraordinary
  return null;
}

/** The accounts the second step closes into 88: results by nature and income tax. */
export function closesIntoNetResult(code: string): boolean {
  const first = Number(code.split(".")[0]);
  return first >= 82 && first <= 87;
}

/** Accounts carried into the next year: balance-sheet classes (1-5) and class 8 (results, kept until allocated). */
export function carriedForward(code: string): boolean {
  const cls = Number(code[0]);
  return cls <= 5 || cls === 8;
}

export interface ClosingLine {
  accountId: string;
  debit?: Prisma.Decimal;
  credit?: Prisma.Decimal;
}

/** Lines that bring each balance to zero, and the total moved to the counterpart (debit − credit). */
export function zeroingLines(balances: { accountId: string; balance: Prisma.Decimal }[]): { lines: ClosingLine[]; net: Prisma.Decimal } {
  let net = new Prisma.Decimal(0);
  const lines: ClosingLine[] = [];
  for (const b of balances) {
    if (b.balance.isZero()) continue;
    net = net.plus(b.balance);
    lines.push(b.balance.gt(0) ? { accountId: b.accountId, credit: b.balance } : { accountId: b.accountId, debit: b.balance.negated() });
  }
  return { lines, net };
}
