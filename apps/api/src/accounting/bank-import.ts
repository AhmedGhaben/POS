import { Prisma } from "@prisma/client";
import { inflateRawSync } from "zlib";

/**
 * Reading bank statements (docs/ACCOUNTING-DECISIONS.md, B3): Angolan banks
 * don't share one format, so a statement is read as a plain table (CSV or
 * the first sheet of an Excel file) and the person says which column is
 * the date, the description, the amount (or debit and credit) and the
 * reference.
 */

export type Table = string[][];

/** A CSV file (";" or "," separated, quoted fields, BOM) as rows of text. */
export function readCsv(text: string): Table {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) && firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows: Table = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/** Entries of a zip archive (stored or deflated), by name. */
function unzipAny(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // The central directory has the sizes even when local headers don't (data descriptors).
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("Not a zip file");
  const count = archive.readUInt16LE(end + 10);
  let p = archive.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = archive.readUInt16LE(p + 10);
    const compressed = archive.readUInt32LE(p + 20);
    const nameLength = archive.readUInt16LE(p + 28);
    const extraLength = archive.readUInt16LE(p + 30);
    const commentLength = archive.readUInt16LE(p + 32);
    const local = archive.readUInt32LE(p + 42);
    const name = archive.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    const localName = archive.readUInt16LE(local + 26);
    const localExtra = archive.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    const data = archive.subarray(start, start + compressed);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const xmlText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

/** The first sheet of an Excel (.xlsx) file as rows of text (numbers as written in the cell, dates as Excel day numbers). */
export function readXlsx(file: Buffer): Table {
  const files = unzipAny(file);
  const shared: string[] = [];
  const sst = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    shared.push(xmlText((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  }
  const sheetName = [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("No sheet in the workbook");
  const sheet = files.get(sheetName)!.toString("utf8");
  const rows: Table = [];
  for (const rowXml of sheet.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) ?? []) {
    const row: string[] = [];
    for (const c of rowXml.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = /r="([A-Z]+)\d+"/.exec(c)?.[1] ?? "";
      const col = [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = /t="(\w+)"/.exec(c)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
      const inline = /<is>([\s\S]*?)<\/is>/.exec(c)?.[1];
      const value = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? xmlText((inline ?? "").replace(/<[^>]+>/g, "")) : xmlText(v ?? "");
      if (col >= 0) row[col] = value.trim();
    }
    const filled = Array.from({ length: row.length }, (_, i) => row[i] ?? "");
    if (filled.some((x) => x)) rows.push(filled);
  }
  return rows;
}

/** Which column holds what (0-based). An amount column, or debit and credit columns. */
export interface ColumnMapping {
  date: number;
  description: number;
  amount?: number | null;
  debit?: number | null;
  credit?: number | null;
  reference?: number | null;
  /** The first rows to skip (headings). */
  skipRows?: number;
}

/** "1.234,56", "1 234.56", "-1234,5", "(150,00)" → a decimal; null when it isn't a number. */
export function parseAmount(text: string): Prisma.Decimal | null {
  let t = text.replace(/[\s\u00a0\u202f]/g, "").replace(/(Kz|AOA|KZ)$/i, "");
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  } else if (t.endsWith("-")) {
    negative = !negative;
    t = t.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  const decimals = last >= 0 && t.length - last - 1 <= 2 && t.length - last - 1 > 0;
  const whole = (decimals ? t.slice(0, last) : t).replace(/[.,]/g, "");
  const frac = decimals ? t.slice(last + 1) : "0";
  const v = new Prisma.Decimal(`${whole}.${frac}`);
  return negative ? v.negated() : v;
}

/** "17/10/2026", "17-10-2026", "2026-10-17", "17.10.26" or an Excel day number → "2026-10-17"; null when it isn't a date. */
export function parseStatementDate(text: string): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else if (/^\d{5}(\.\d+)?$/.test(t)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000);
    return date.toISOString().slice(0, 10);
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export interface StatementRow {
  row: number;
  date: string;
  description: string;
  reference: string | null;
  /** Money in positive, out negative. */
  amount: Prisma.Decimal;
}

/** The statement's movements by the mapping; rows that aren't movements (headings, balances, blanks) are named in `skipped`. */
export function mapStatement(table: Table, mapping: ColumnMapping): { rows: StatementRow[]; skipped: number[] } {
  const rows: StatementRow[] = [];
  const skipped: number[] = [];
  table.forEach((cells, i) => {
    if (i < (mapping.skipRows ?? 0)) return;
    const date = parseStatementDate(cells[mapping.date] ?? "");
    let amount: Prisma.Decimal | null = null;
    if (mapping.amount !== undefined && mapping.amount !== null) amount = parseAmount(cells[mapping.amount] ?? "");
    else {
      const out = mapping.debit !== undefined && mapping.debit !== null ? parseAmount(cells[mapping.debit] ?? "") : null;
      const inn = mapping.credit !== undefined && mapping.credit !== null ? parseAmount(cells[mapping.credit] ?? "") : null;
      if (out || inn) amount = (inn ?? new Prisma.Decimal(0)).abs().minus((out ?? new Prisma.Decimal(0)).abs());
    }
    if (!date || !amount || amount.isZero()) {
      skipped.push(i + 1);
      return;
    }
    rows.push({
      row: i + 1,
      date,
      description: (cells[mapping.description] ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || "-",
      reference: mapping.reference !== undefined && mapping.reference !== null ? (cells[mapping.reference] ?? "").trim().slice(0, 60) || null : null,
      amount: amount.toDecimalPlaces(2),
    });
  });
  return { rows, skipped };
}

/** The ledger line a statement line most likely is: same amount on the right side, closest date within `days`. */
export function bestMatch<T extends { id: string; date: string; amount: Prisma.Decimal }>(line: { date: string; amount: Prisma.Decimal }, candidates: T[], days = 3): T | null {
  const t = Date.parse(`${line.date}T00:00:00Z`);
  let best: T | null = null;
  let bestGap = Infinity;
  for (const c of candidates) {
    if (!c.amount.eq(line.amount)) continue;
    const gap = Math.abs(Date.parse(`${c.date}T00:00:00Z`) - t) / 86_400_000;
    if (gap <= days && gap < bestGap) {
      best = c;
      bestGap = gap;
    }
  }
  return best;
}
