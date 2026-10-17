import { Prisma } from "@prisma/client";
import { PdfDocument, textWidth } from "../common/pdf";
import { documentPdf } from "./document-pdf";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Checks the cross-reference table: every offset points at its object. */
function xrefIsSound(pdf: Buffer): boolean {
  const text = pdf.toString("latin1");
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
  const table = text.slice(start).split("\n");
  const count = Number(table[1].split(" ")[1]);
  for (let i = 1; i < count; i++) {
    const offset = Number(table[2 + i].slice(0, 10));
    if (!text.startsWith(`${i} 0 obj`, offset)) return false;
  }
  return true;
}

describe("PDF archive copies", () => {
  it("a document: A4 text, accents in WinAnsi, a sound cross-reference table", () => {
    const pdf = documentPdf({
      documentNo: "FR POS001-2026/57",
      typeName: "Factura-Recibo",
      status: "N",
      statusReason: null,
      invoiceDate: new Date("2026-10-17"),
      systemEntryDate: new Date("2026-10-17T10:00:00Z"),
      seller: { legalName: "Kianda & Filhos, Lda", taxId: "5417000123", address: "Rua da Missão 12", city: "Luanda", certificate: null },
      buyerName: "Consumidor Final",
      buyerTaxId: "999999999",
      currency: "AOA",
      netTotal: D(100),
      taxPayable: D(14),
      grossTotal: D(114),
      hashExcerpt: "Ab3x",
      hashControl: "0",
      lines: [{ productDescription: "Óleo de palma (1 L)", quantity: D(1), unit: "un", unitPrice: D(100), netAmount: D(100), taxes: [{ percentage: D(14), exemptionCode: null }] }],
    });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/BaseFont /Helvetica /Encoding /WinAnsiEncoding");
    expect(text).toContain("(Factura-Recibo FR POS001-2026/57) Tj");
    expect(text).toContain("Missão"); // ã as one Latin-1 byte
    expect(text).toContain("(Óleo de palma \\(1 L\\)) Tj"); // parentheses escaped
    expect(text).toContain("(114,00) Tj");
    expect(text).toContain("Ab3x-Processado por programa não certificado");
    expect(xrefIsSound(pdf)).toBe(true);
  });

  it("many lines run onto more pages", () => {
    const pdf = new PdfDocument();
    for (let i = 0; i < 120; i++) {
      pdf.ensure(12);
      pdf.text(`Linha ${i}`, 40);
      pdf.y += 12;
    }
    const out = pdf.toBuffer();
    expect(/\/Count (\d+)/.exec(out.toString("latin1"))![1]).toBe("2");
    expect(xrefIsSound(out)).toBe(true);
    expect(textWidth("1 234,56", 10)).toBeCloseTo((556 * 6 + 278 * 2) / 100, 5);
  });
});
