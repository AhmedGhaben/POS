import { Prisma } from "@prisma/client";

/**
 * An entry's rules before it reaches the database (which checks them again):
 * amounts in cents, one side per line, balanced, both sides present.
 */

export type Money = Prisma.Decimal;
export const ZERO = new Prisma.Decimal(0);
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface LineInput {
  accountId: string;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
  description?: string | null;
  sourceDocumentId?: string | null;
}

export interface CheckedLine {
  accountId: string;
  debit: Money;
  credit: Money;
  description: string | null;
  sourceDocumentId: string | null;
}

/** Errors in the lines, in words; none means the entry can be posted. */
export function lineProblems(lines: LineInput[]): string[] {
  const problems: string[] = [];
  if (lines.length < 2) problems.push("An entry needs at least two lines");
  let debit = ZERO;
  let credit = ZERO;
  lines.forEach((l, i) => {
    const d = D(l.debit ?? 0);
    const c = D(l.credit ?? 0);
    if (d.isNegative() || c.isNegative()) problems.push(`Line ${i + 1}: amounts can't be negative`);
    if (d.decimalPlaces() > 2 || c.decimalPlaces() > 2) problems.push(`Line ${i + 1}: amounts have at most two decimals`);
    if (d.gt(0) === c.gt(0)) problems.push(`Line ${i + 1}: a line is either a debit or a credit`);
    debit = debit.plus(d);
    credit = credit.plus(c);
  });
  if (!lines.some((l) => D(l.debit ?? 0).gt(0)) || !lines.some((l) => D(l.credit ?? 0).gt(0))) {
    problems.push("An entry needs at least one debit and one credit line");
  }
  if (!debit.eq(credit)) problems.push(`The entry doesn't balance: debits ${debit.toFixed(2)}, credits ${credit.toFixed(2)}`);
  return [...new Set(problems)];
}

/** Lines with their amounts as decimals and zero lines left out. */
export function normaliseLines(lines: LineInput[]): CheckedLine[] {
  return lines
    .map((l) => ({
      accountId: l.accountId,
      debit: D(l.debit ?? 0),
      credit: D(l.credit ?? 0),
      description: l.description?.trim() || null,
      sourceDocumentId: l.sourceDocumentId?.trim() || null,
    }))
    .filter((l) => l.debit.gt(0) || l.credit.gt(0));
}

/**
 * Sums lines on the same account, side and source document (for daily
 * summaries and for tidy automatic entries); a debit and a credit on the
 * same account are netted into one line.
 */
export function mergeLines(lines: CheckedLine[], { bySource = true } = {}): CheckedLine[] {
  const out = new Map<string, CheckedLine>();
  for (const l of lines) {
    const key = `${l.accountId}|${bySource ? (l.sourceDocumentId ?? "") : ""}|${l.description ?? ""}`;
    const prev = out.get(key);
    if (!prev) {
      out.set(key, { ...l, sourceDocumentId: bySource ? l.sourceDocumentId : null });
      continue;
    }
    const net = prev.debit.minus(prev.credit).plus(l.debit).minus(l.credit);
    prev.debit = net.gt(0) ? net : ZERO;
    prev.credit = net.lt(0) ? net.negated() : ZERO;
  }
  return [...out.values()].filter((l) => l.debit.gt(0) || l.credit.gt(0));
}

/** SAF-T TransactionID: "<TransactionDate> <JournalID> <DocArchivalNumber>" (Decreto Executivo 317/20, 3.4.3.1). */
export function transactionId(transactionDate: string, journalCode: string, archival: string): string {
  return `${transactionDate} ${journalCode} ${archival}`;
}

/** DocArchivalNumber: the entry's number in its journal and year, "2026/57". */
export function archivalNumber(year: number, number: number): string {
  return `${year}/${number}`;
}

/** Text cut to the SAF-T Description's 200 characters. */
export function description200(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return Array.from(clean).slice(0, 200).join("").trimEnd() || "-";
}
