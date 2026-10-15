/** Selling on credit at the till (docs/plans/ANGOLA.md, phase 4). */
export interface CreditChoice {
  on: boolean;
  /** Paid now, as typed (the rest goes on the account). */
  paidNow: string;
}

export const NO_CREDIT: CreditChoice = { on: false, paidNow: "" };

/** What is paid now and what goes on the account, to the cent. */
export function creditSplit(total: number, choice: CreditChoice): { paidNow: number; onAccount: number } {
  if (!choice.on) return { paidNow: total, onAccount: 0 };
  const paid = Math.min(Math.max(Number(choice.paidNow) || 0, 0), total);
  const paidNow = Math.round(paid * 100) / 100;
  return { paidNow, onAccount: Math.round((total - paidNow) * 100) / 100 };
}
