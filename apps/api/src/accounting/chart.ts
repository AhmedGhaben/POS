import { LedgerAccountCategory } from "@prisma/client";

/**
 * The chart's rules, without the database: codes, parents and categories.
 * Codes are dotted (31.1.2.1); first-degree accounts have two digits.
 */

/** SAF-T AccountID: 1-30 of [0-9a-zA-Z-/._+*]; ours also start with the class digit and use dots between parts. */
const CODE = /^[1-8][0-9](\.[0-9A-Za-z]{1,10})*$/;

export function isValidCode(code: string): boolean {
  return code.length <= 30 && CODE.test(code);
}

/** "31.1.2" → "31.1"; a first-degree account ("31") has none. */
export function parentCode(code: string): string | null {
  const i = code.lastIndexOf(".");
  return i < 0 ? null : code.slice(0, i);
}

/** The PGC class: the code's first digit. */
export function classOf(code: string): number {
  return Number(code[0]);
}

/** GR for first-degree accounts, GA for accounts with sub-accounts, GM for the rest (they take postings). */
export function categoryFor(code: string, hasChildren: boolean): LedgerAccountCategory {
  if (parentCode(code) === null) return LedgerAccountCategory.GR;
  return hasChildren ? LedgerAccountCategory.GA : LedgerAccountCategory.GM;
}

/** Codes in the order an accountant reads them: 11, 11.1, 11.2, …, 11.10, 12. */
export function compareCodes(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const c = Number.isNaN(na) || Number.isNaN(nb) ? pa[i].localeCompare(pb[i]) : na - nb;
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * The next free sub-account code under `parent`: one more than the highest
 * numeric last part in use (starting at `first`), padded to `width` digits.
 */
export function nextChildCode(parent: string, siblings: string[], { first = 1, width = 1 } = {}): string {
  let max = first - 1;
  for (const s of siblings) {
    if (parentCode(s) !== parent) continue;
    const n = Number(s.slice(parent.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${parent}.${String(max + 1).padStart(width, "0")}`;
}

/** Text cut to the SAF-T AccountDescription's 100 characters. */
export function accountName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  return Array.from(clean).slice(0, 100).join("").trimEnd() || "-";
}
