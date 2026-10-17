/**
 * A small PDF writer: A4 pages of text in Helvetica (WinAnsi, so
 * Portuguese accents print), lines and right-aligned figures. Enough for
 * archive copies of documents; no images or fonts to embed.
 */

const A4 = { width: 595.28, height: 841.89 };

/** Helvetica widths (1/1000 em) for the characters that matter for alignment; others ≈ 556. */
const WIDTHS: Record<string, number> = {
  " ": 278, ",": 278, ".": 278, "-": 333, "/": 278, ":": 278, "%": 889, "(": 333, ")": 333,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  i: 222, l: 222, j: 222, f: 278, t: 278, r: 333, I: 278, m: 833, w: 722, M: 833, W: 944,
};

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += WIDTHS[ch] ?? (bold ? 611 : 556);
  return (w / 1000) * size;
}

/** Latin-1 (WinAnsi) bytes of a string; anything else becomes "?". */
function winAnsi(text: string): string {
  let out = "";
  for (const ch of text.replace(/[\u00a0\u202f]/g, " ")) {
    const code = ch.charCodeAt(0);
    const mapped = ch === "€" ? "\u0080" : ch === "–" ? "\u0096" : ch === "—" ? "\u0097" : ch === "“" ? "\u0093" : ch === "”" ? "\u0094" : ch === "’" ? "\u0092" : ch;
    out += mapped.charCodeAt(0) <= 0xff && (code <= 0xff || mapped !== ch) ? mapped : "?";
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export class PdfDocument {
  private readonly pages: string[][] = [];
  private current: string[] = [];
  /** Distance from the top of the page, in points. */
  y = 50;
  readonly margin = 40;
  readonly width = A4.width;
  readonly height = A4.height;

  constructor() {
    this.pages.push(this.current);
  }

  newPage() {
    this.current = [];
    this.pages.push(this.current);
    this.y = 50;
  }

  /** Starts a new page when fewer than `needed` points are left. */
  ensure(needed: number) {
    if (this.y + needed > this.height - this.margin) this.newPage();
  }

  text(text: string, x: number, opts: { size?: number; bold?: boolean; align?: "left" | "right"; y?: number } = {}) {
    const size = opts.size ?? 9;
    const at = opts.align === "right" ? x - textWidth(text, size, opts.bold) : x;
    const y = this.height - (opts.y ?? this.y);
    this.current.push(`BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${at.toFixed(2)} ${y.toFixed(2)} Td (${winAnsi(text)}) Tj ET`);
  }

  line(x1: number, x2: number, y = this.y) {
    const yy = this.height - y;
    this.current.push(`0.5 w ${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S`);
  }

  /** Text cut to fit a width (with "…"). */
  fit(text: string, width: number, size = 9): string {
    if (textWidth(text, size) <= width) return text;
    let t = text;
    while (t.length > 1 && textWidth(`${t}...`, size) > width) t = t.slice(0, -1);
    return `${t}...`;
  }

  toBuffer(): Buffer {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body) - 1 + 1;
    const catalog = add(""); // filled below
    const pagesId = add("");
    const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];
    for (const ops of this.pages) {
      const stream = ops.join("\n");
      const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
      pageIds.push(
        add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${content} 0 R >>`),
      );
    }
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    let out = "%PDF-1.4\n%âãÏÓ\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(out, "latin1"));
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
  }
}
