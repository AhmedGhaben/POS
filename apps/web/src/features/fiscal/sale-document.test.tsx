import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FiscalDocumentSummaryDto, InvoiceDto, SaleDto } from "@pos/shared";
import { saleDocument, saleNumber } from "./sale-document";
import { InvoiceDocument } from "@/features/invoices/components/InvoiceDocument";

const document = (documentType: string, documentNo: string) => ({ documentType, documentNo, id: documentNo, status: "N", hashExcerpt: "abcd", hashControl: "0" }) as FiscalDocumentSummaryDto;
const fiscalDocuments = [document("NC", "NC POS001-2026/1"), document("FR", "FR POS001-2026/57")];
describe("sale identifiers displayed to people", () => {
  it("uses FR/FT rather than an internal reference or the sale's credit note", () => {
    expect(saleNumber({ receiptNumber: "MAIN-1792930259132", fiscalDocuments })).toBe("FR POS001-2026/57");
    expect(saleNumber({ receiptNumber: "MAIN-1", fiscalDocuments: [document("FT", "FT POS001-2026/3")] })).toBe("FT POS001-2026/3");
    expect(saleDocument({ receiptNumber: "MAIN-1", fiscalDocuments })).toBe(fiscalDocuments[1]);
  });
  it("keeps a usable fallback for historical and non-fiscal sales", () => {
    expect(saleNumber({ receiptNumber: "LEGACY-1" })).toBe("LEGACY-1");
    expect(saleNumber({ receiptNumber: "LEGACY-1", fiscalDocuments: [] })).toBe("LEGACY-1");
  });
  it("prints the fiscal sale reference on an older invoice without changing that invoice's own number", () => {
    const sale = { receiptNumber: "MAIN-1792930259132", fiscalDocuments, storeId: "s1", createdAt: "2026-10-29T09:00:00Z", lineItems: [], payments: [], paymentMethod: "CASH", total: "0" } as unknown as SaleDto;
    const invoice = { number: "INV-2026-0001", issuedAt: "2026-10-29T09:00:00Z", buyerName: "Test buyer", seller: { name: "Test seller", currency: "AOA", store: { id: "s1", address: null, phone: null } }, sale } as InvoiceDto;
    const html = renderToStaticMarkup(<InvoiceDocument invoice={invoice} />);
    expect(html).toContain("INV-2026-0001");
    expect(html).toContain("FR POS001-2026/57");
    expect(html).not.toContain("MAIN-1792930259132");
    expect(renderToStaticMarkup(<InvoiceDocument invoice={{ ...invoice, sale: { ...sale, fiscalDocuments: [] } }} />)).toContain("MAIN-1792930259132");
  });
});
