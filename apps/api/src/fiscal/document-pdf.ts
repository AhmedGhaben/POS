import { Prisma } from "@prisma/client";
import { PdfDocument } from "../common/pdf";

/**
 * A fiscal document as an archive copy (PDF, A4, text only): the seller,
 * the buyer, the lines, the totals, the hash characters and the software
 * mention. For the accountant's archive (docs/ACCOUNTING-DECISIONS.md, B2);
 * the documents customers get are still printed by the app.
 */

export interface DocumentForPdf {
  documentNo: string;
  typeName: string;
  status: string;
  statusReason: string | null;
  invoiceDate: Date;
  systemEntryDate: Date;
  seller: Prisma.JsonValue;
  buyerName: string;
  buyerTaxId: string;
  currency: string;
  netTotal: Prisma.Decimal;
  taxPayable: Prisma.Decimal;
  grossTotal: Prisma.Decimal;
  hashExcerpt: string;
  hashControl: string;
  lines: { productDescription: string; quantity: Prisma.Decimal; unit: string; unitPrice: Prisma.Decimal; netAmount: Prisma.Decimal; taxes: { percentage: Prisma.Decimal; exemptionCode: string | null }[] }[];
}

const money = (v: Prisma.Decimal.Value) => new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
const qty = (v: Prisma.Decimal.Value) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 3 }).format(Number(v));
const day = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

export function documentPdf(doc: DocumentForPdf): Buffer {
  const s = (doc.seller ?? {}) as Record<string, string | null | Record<string, string | null>>;
  const pdf = new PdfDocument();
  const left = pdf.margin;
  const right = pdf.width - pdf.margin;

  pdf.text(String(s.legalName || s.name || ""), left, { size: 13, bold: true });
  pdf.y += 14;
  for (const l of [s.taxId ? `NIF ${s.taxId}` : "", [s.address, s.city, s.province].filter(Boolean).join(", "), [s.phone, s.email].filter(Boolean).join(" · ")]) {
    if (!l) continue;
    pdf.text(l, left);
    pdf.y += 11;
  }
  pdf.y += 8;
  pdf.text(`${doc.typeName} ${doc.documentNo}`, left, { size: 12, bold: true });
  pdf.text("Cópia de arquivo", right, { align: "right", size: 9 });
  pdf.y += 14;
  pdf.text(`Data: ${day(doc.invoiceDate)}`, left);
  if (doc.status === "A") pdf.text(`ANULADO${doc.statusReason ? `: ${doc.statusReason}` : ""}`, right, { align: "right", bold: true });
  pdf.y += 14;
  pdf.text(`Cliente: ${doc.buyerName}`, left);
  pdf.text(`NIF: ${doc.buyerTaxId}`, right, { align: "right" });
  pdf.y += 18;

  const cols = { desc: left, qty: 330, price: 410, tax: 450, total: right };
  const header = () => {
    pdf.text("Descrição", cols.desc, { bold: true });
    pdf.text("Qtd.", cols.qty, { bold: true, align: "right" });
    pdf.text("Preço", cols.price, { bold: true, align: "right" });
    pdf.text("IVA", cols.tax, { bold: true, align: "right" });
    pdf.text("Total s/ IVA", cols.total, { bold: true, align: "right" });
    pdf.y += 4;
    pdf.line(left, right);
    pdf.y += 11;
  };
  header();
  for (const l of doc.lines) {
    if (pdf.y > pdf.height - 120) {
      pdf.newPage();
      header();
    }
    const t = l.taxes[0];
    pdf.text(pdf.fit(l.productDescription, cols.qty - cols.desc - 50), cols.desc);
    pdf.text(`${qty(l.quantity)} ${l.unit}`, cols.qty, { align: "right" });
    pdf.text(money(l.unitPrice), cols.price, { align: "right" });
    pdf.text(t ? (Number(t.percentage) ? `${Number(t.percentage)}%` : (t.exemptionCode ?? "0%")) : "-", cols.tax, { align: "right" });
    pdf.text(money(l.netAmount), cols.total, { align: "right" });
    pdf.y += 12;
  }
  pdf.ensure(90);
  pdf.line(cols.price - 60, right);
  pdf.y += 12;
  for (const [label, value, bold] of [["Total Ilíquido", doc.netTotal, false], ["Total Imposto", doc.taxPayable, false], [`Total (${doc.currency})`, doc.grossTotal, true]] as const) {
    pdf.text(label, cols.price, { align: "right", bold });
    pdf.text(money(value), cols.total, { align: "right", bold });
    pdf.y += 12;
  }
  pdf.y += 10;
  const certificate = typeof s.certificate === "string" && s.certificate ? s.certificate : null;
  pdf.text(`${doc.hashExcerpt}-Processado por programa ${certificate ? `certificado n.º ${certificate}` : "não certificado"}`, left, { size: 8 });
  return pdf.toBuffer();
}
