import { parseCsv } from "@/lib/csv-parse";
import { parseCents } from "./amounts";

export interface OpeningRow {
  line: number;
  code: string;
  debit: number;
  credit: number;
  accountId: string | null;
  error: string | null;
}

/**
 * Opening balances from a spreadsheet: "account code; debit; credit" per
 * row (a header row is skipped). Amounts in cents; codes looked up in the
 * chart (only active movement accounts).
 */
export function parseOpeningCsv(text: string, accounts: { id: string; code: string; category: string; isActive: boolean }[]): OpeningRow[] {
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const { rows } = parseCsv(text);
  const out: OpeningRow[] = [];
  rows.forEach((cells, i) => {
    const code = (cells[0] ?? "").trim();
    if (!code) return;
    if (i === 0 && !/^\d/.test(code)) return; // header
    const debit = parseCents(cells[1] ?? "");
    const credit = parseCents(cells[2] ?? "");
    const account = byCode.get(code);
    let error: string | null = null;
    if (debit === null || credit === null) error = "amount";
    else if (debit > 0 && credit > 0) error = "bothSides";
    else if (!account) error = "unknownAccount";
    else if (account.category !== "GM" || !account.isActive) error = "notMovement";
    out.push({ line: i + 1, code, debit: debit ?? 0, credit: credit ?? 0, accountId: account?.id ?? null, error });
  });
  return out.filter((r) => r.error || r.debit > 0 || r.credit > 0);
}
