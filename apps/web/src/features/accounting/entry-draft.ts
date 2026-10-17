import type { TransactionType } from "./api";
import { parseCents } from "./amounts";

/** The entry form's state: what's typed, before it's posted. */

export interface DraftLine {
  key: number;
  accountId: string | null;
  debit: string;
  credit: string;
  description: string;
}

export interface EntryDraft {
  journalId: string | null;
  transactionDate: string;
  postingDate: string;
  period: number | null;
  description: string;
  transactionType: TransactionType;
  lines: DraftLine[];
}

let lineKey = 0;
export const newLine = (over: Partial<DraftLine> = {}): DraftLine => ({ key: ++lineKey, accountId: null, debit: "", credit: "", description: "", ...over });

export function emptyDraft(today: string): EntryDraft {
  return { journalId: null, transactionDate: today, postingDate: "", period: null, description: "", transactionType: "N", lines: [newLine(), newLine()] };
}

/** Totals of a draft in cents; null when an amount can't be read. */
export function draftTotals(lines: DraftLine[]): { debit: number; credit: number; valid: boolean } {
  let debit = 0;
  let credit = 0;
  let valid = true;
  for (const l of lines) {
    const d = parseCents(l.debit);
    const c = parseCents(l.credit);
    if (d === null || c === null || (d > 0 && c > 0)) valid = false;
    debit += d ?? 0;
    credit += c ?? 0;
  }
  return { debit, credit, valid };
}

