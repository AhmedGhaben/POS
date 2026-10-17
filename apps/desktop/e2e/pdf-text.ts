import zlib from "zlib";

/**
 * The text of a PDF as Chromium's printToPDF writes it, for tests: pages'
 * content streams decoded through each font's ToUnicode map. Just enough
 * of PDF for checking what an archive copy says; whitespace between text
 * runs isn't reliable, so compare with whitespace removed.
 */
export function pdfText(pdf: Buffer): { pages: number; text: string; fonts: number; images: number } {
  const raw = pdf.toString("latin1");
  const objects = new Map<number, { dict: string; stream: Buffer | null }>();
  const objRe = /(\d+) 0 obj\s*([\s\S]*?)endobj/g;
  for (let m = objRe.exec(raw); m; m = objRe.exec(raw)) {
    const body = m[2];
    const s = body.indexOf("stream");
    if (s < 0) {
      objects.set(Number(m[1]), { dict: body, stream: null });
      continue;
    }
    const dict = body.slice(0, s);
    let start = s + "stream".length;
    if (body[start] === "\r") start++;
    if (body[start] === "\n") start++;
    const end = body.lastIndexOf("endstream");
    let data = Buffer.from(body.slice(start, end), "latin1");
    if (/\/FlateDecode/.test(dict)) data = zlib.inflateSync(data);
    objects.set(Number(m[1]), { dict, stream: data });
  }
  const ref = (s: string | undefined) => (s ? objects.get(Number(s)) : undefined);
  const dictOf = (value: string, key: string) => {
    // Inline (<< ... >>, which may hold dictionaries of its own) or a reference (N 0 R) to one.
    const at = new RegExp(`/${key}\\s*<<`).exec(value);
    if (at) {
      const start = at.index + at[0].length;
      let depth = 1;
      for (let i = start; i < value.length - 1; i++) {
        if (value.startsWith("<<", i)) (depth++, i++);
        else if (value.startsWith(">>", i) && --depth === 0) return value.slice(start, i);
        else if (value.startsWith(">>", i)) i++;
      }
      return value.slice(start);
    }
    const r = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(value);
    return r ? (ref(r[1])?.dict ?? "") : "";
  };

  /** Code (as hex) → text, and how many hex digits a code takes, per font object. */
  const cmaps = new Map<number, { map: Map<string, string>; width: number }>();
  const cmapFor = (fontId: number) => {
    if (cmaps.has(fontId)) return cmaps.get(fontId)!;
    const tu = /\/ToUnicode\s+(\d+) 0 R/.exec(objects.get(fontId)?.dict ?? "");
    const cmap = (tu && ref(tu[1])?.stream?.toString("latin1")) ?? "";
    const map = new Map<string, string>();
    const hexText = (h: string) => String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((u) => parseInt(u, 16)));
    for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
      for (const [, code, text] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(code.toUpperCase(), hexText(text));
    }
    for (const block of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
      for (const [, lo, hi, text] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const base = parseInt(text, 16);
        for (let c = parseInt(lo, 16); c <= parseInt(hi, 16); c++) map.set(c.toString(16).toUpperCase().padStart(lo.length, "0"), String.fromCodePoint(base + c - parseInt(lo, 16)));
      }
    }
    const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(cmap);
    const entry = { map, width: space ? space[1].length : 4 };
    cmaps.set(fontId, entry);
    return entry;
  };

  let pages = 0;
  let images = 0;
  const fontIds = new Set<number>();
  const text: string[] = [];
  for (const { dict } of objects.values()) {
    if (!/\/Type\s*\/Page(?!s)/.test(dict)) continue;
    pages++;
    const resources = dictOf(dict, "Resources");
    const fonts = new Map<string, number>();
    for (const [, name, id] of dictOf(resources, "Font").matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      fonts.set(name, Number(id));
      fontIds.add(Number(id));
    }
    images += (dictOf(resources, "XObject").match(/\d+ 0 R/g) ?? []).filter((r) => /\/Subtype\s*\/Image/.test(ref(r.split(" ")[0])?.dict ?? "")).length;
    const contents = /\/Contents\s+(\d+) 0 R/.exec(dict);
    const stream = (contents && ref(contents[1])?.stream?.toString("latin1")) ?? "";
    let font: { map: Map<string, string>; width: number } | null = null;
    for (const [, fontName, hexes] of stream.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|((?:<[0-9A-Fa-f]*>\s*Tj)|\[[^\]]*\]\s*TJ)/g)) {
      if (fontName) {
        const id = fonts.get(fontName);
        font = id === undefined ? null : cmapFor(id);
        continue;
      }
      if (!font) continue;
      for (const [, hex] of hexes.matchAll(/<([0-9A-Fa-f]*)>/g)) {
        for (let i = 0; i < hex.length; i += font.width) text.push(font.map.get(hex.slice(i, i + font.width).toUpperCase()) ?? "");
      }
      text.push(" ");
    }
  }
  return { pages, text: text.join(""), fonts: fontIds.size, images };
}
