/**
 * Minimal RFC 4180 reader for spreadsheet exports: quoted fields (with ""
 * escapes and embedded newlines), CRLF or LF line endings, a UTF-8 BOM, and
 * the delimiter European Excel uses (";"). Returns rows of raw strings and
 * drops rows that are entirely empty.
 */
export function parseCsv(text: string): { rows: string[][]; delimiter: string } {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows: rows.filter((r) => r.some((cell) => cell.trim() !== "")), delimiter };
}

/** Picks the delimiter that splits the header line most: comma, semicolon or tab. */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = [",", ";", "\t"].map((d) => [d, countOutsideQuotes(firstLine, d)] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function countOutsideQuotes(line: string, ch: string): number {
  let count = 0;
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ch && !inQuotes) count++;
  }
  return count;
}

/**
 * Parses a number typed in any common style: "1234.5", "1,234.50",
 * "1.234,50", "12,5", "€ 3.99", "1 234,5". Returns null for blank input and
 * NaN for anything unreadable.
 */
export function parseLooseNumber(raw: string): number | null {
  let s = raw.trim().replace(/[\s\u00a0\u202f]/g, "").replace(/[^\d.,-]/g, "");
  if (raw.trim() === "") return null;
  if (s === "" || s === "-") return NaN;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Only commas: "1,234" (thousands) vs "12,5" (decimal). One comma with
    // exactly 3 digits after it is ambiguous; treat it as thousands only if
    // there's more than one comma.
    const parts = s.split(",");
    s = parts.length > 2 ? parts.join("") : s.replace(",", ".");
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
