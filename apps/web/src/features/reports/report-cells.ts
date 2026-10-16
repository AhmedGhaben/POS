import type { Cell, ColumnKind } from "./tables-api";

export interface CellFormatters {
  money: (v: string | number) => string;
  quantity: (v: string | number) => string;
  /** A plain number in the locale (percentages). */
  number: (v: number) => string;
  date: (v: string) => string;
  month: (v: string) => string;
  /** Payment methods, document types, AGT states. */
  code: (kind: "method" | "docType" | "agtStatus", v: string) => string;
  /** An empty cell. */
  none: string;
}

/** A report cell as shown on screen and on paper. */
export function cellText(kind: ColumnKind, value: Cell, f: CellFormatters): string {
  if (value === null || value === "") return kind === "percent" || kind === "money" ? "" : f.none;
  switch (kind) {
    case "money":
      return f.money(value);
    case "quantity":
      return f.quantity(value);
    case "count":
      return String(value);
    case "percent":
      return `${f.number(Number(value))} %`;
    case "date":
      return f.date(String(value));
    case "month":
      return f.month(String(value));
    case "method":
    case "docType":
    case "agtStatus":
      return f.code(kind, String(value));
    default:
      return String(value);
  }
}

/**
 * A report cell in a CSV file: numbers stay plain (12345.67, the
 * spreadsheet formats them), dates ISO, codes translated.
 */
export function csvCell(kind: ColumnKind, value: Cell, f: Pick<CellFormatters, "code">): Cell {
  if (value === null) return "";
  if (kind === "method" || kind === "docType" || kind === "agtStatus") return f.code(kind, String(value));
  return value;
}

/** Right-aligned columns. */
export function isNumeric(kind: ColumnKind): boolean {
  return kind === "money" || kind === "quantity" || kind === "count" || kind === "percent";
}
