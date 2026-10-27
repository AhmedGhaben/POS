import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BusinessDto, FiscalDocumentDto, ShiftSummaryDto, StoreDto, UserDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { A4Document } from "@/features/documents/components/A4Document";
import { documentLine } from "@/features/documents/lines";
import { FiscalA4 } from "@/features/fiscal/components/FiscalA4";
import { ReportA4 } from "@/features/reports/components/ReportViewer";
import { useCellFormatters } from "@/features/reports/use-cell-formatters";
import type { ReportResultDto } from "@/features/reports/tables-api";
import { ShiftReport } from "@/features/shifts/components/ShiftReport";
import i18n from "./index";
import { documentLanguage } from "./use-document-language";
import en from "../locales/en/documents.json";
import enReports from "../locales/en/reports.json";
import enShifts from "../locales/en/shifts.json";
import ptDocuments from "../locales/pt-PT/documents.json";
import ptReports from "../locales/pt-PT/reports.json";
import ptShifts from "../locales/pt-PT/shifts.json";

/**
 * Documents follow the STORE's country, not the screen language
 * (docs/DECISIONS.md, "Document language"): an Angolan store's invoice and
 * reports are in Portuguese even when the person printing them reads the
 * app in English.
 */

const store: StoreDto = { id: "s1", businessId: "b1", name: "Loja Central", address: "Rua 1", phone: null, timezone: "Africa/Luanda", isActive: true, country: "AO", ivaRegime: "GERAL", pricesIncludeTax: true };

/** English words that only an untranslated document would show. */
const ENGLISH = ["Invoice", "Receipt", "Customer", "Quantity", "Price", "Discount", "Change", "Payment", "Amount", "Date", "Product", "Generated", "Thank you", "Opened", "Closed", "Expected", "Counted", "Cash sales"];

/** Every English text of these files that Portuguese says differently, without its {{placeholders}}. */
function englishOnly(enTree: unknown, ptTree: unknown, out: string[] = []): string[] {
  if (typeof enTree === "string") {
    for (const piece of enTree.split(/\{\{[^}]+\}\}/)) {
      const text = piece.trim().replace(/[:.,]$/, "");
      if (text.length >= 6 && text !== ptTree && !(typeof ptTree === "string" && ptTree.includes(text))) out.push(text);
    }
  } else if (enTree && typeof enTree === "object") {
    for (const [k, v] of Object.entries(enTree)) englishOnly(v, (ptTree as Record<string, unknown> | undefined)?.[k], out);
  }
  return out;
}

function expectNoEnglish(html: string, extra: string[]) {
  const text = html.replace(/<[^>]+>/g, " ");
  for (const word of [...ENGLISH, ...extra]) {
    expect(text, `English left on an Angolan document: "${word}"`).not.toMatch(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
  }
}

/**
 * Rendering to HTML (no browser here), zustand hooks read the store's
 * initial state, so the session goes in both.
 */
function setSession(state: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState(state);
  Object.assign(useAuthStore.getInitialState(), state);
}

const doc: FiscalDocumentDto = {
  id: "d1", businessId: "b1", storeId: "s1", terminalId: null, documentType: "FR", number: 7, documentNo: "FR POS001-2026/7", status: "N",
  statusDate: "2026-10-17T13:05:00Z", statusReason: null, statusReasonCode: null, invoiceDate: "2026-10-17", systemEntryDate: "2026-10-17T13:05:00Z",
  hash: "abc", hashControl: "0", hashExcerpt: "aBcD",
  seller: { name: "Demo", legalName: "Demo Lda", taxId: "5000000000", registrationNumber: null, legalForm: "LDA", address: "Rua 1", city: "Luanda", postalCode: null, province: "LA", country: "AO", phone: null, email: null, website: null, logoUrl: null, eacCode: null, invoiceFooter: null, currency: "AOA", store: { id: "s1", name: "Loja Central", address: null, city: null, province: null, phone: null }, ivaRegime: "GERAL", certificate: null },
  customerId: null, buyerName: "Consumidor final", buyerTaxId: "999999999", buyerAddress: null, currency: "AOA", pricesIncludeTax: true,
  netTotal: "1000.00", taxPayable: "140.00", grossTotal: "1290.00", discountTotal: "10.00",
  payments: [{ method: "CASH" as never, mechanism: "NU", amount: "1290.00" }], reason: null, saleId: "x", returnId: null, referencedDocument: null,
  lines: [
    { id: "l1", lineNumber: 1, productId: "p1", productCode: "P1", productDescription: "Sumo", quantity: "2", unit: "un", unitPrice: "500.00", discountAmount: "10.00", netAmount: "1000.00", taxAmount: "140.00", grossAmount: "1140.00", referenceDocumentNo: null, referenceLineNumber: null, taxes: [{ id: "t1", taxType: "IVA", taxCountryRegion: "AO", taxCode: "NOR", percentage: "14", amount: "140.00", exemptionCode: null, exemptionReason: null }] },
    { id: "l2", lineNumber: 2, productId: "p2", productCode: "P2", productDescription: "Pão", quantity: "1", unit: "un", unitPrice: "150.00", discountAmount: "0", netAmount: "150.00", taxAmount: "0", grossAmount: "150.00", referenceDocumentNo: null, referenceLineNumber: null, taxes: [{ id: "t2", taxType: "IVA", taxCountryRegion: "AO", taxCode: "ISE", percentage: "0", amount: "0", exemptionCode: "M10", exemptionReason: "Isento nos termos da alínea a) do n.º 1 do artigo 12.º do CIVA" }] },
  ] as FiscalDocumentDto["lines"],
  createdAt: "2026-10-17T13:05:00Z",
};

describe("an Angolan store's documents, printed by someone reading the app in English", () => {
  beforeAll(async () => {
    setSession({
      business: { id: "b1", name: "Demo", currency: "AOA", country: "AO", language: "en" } as BusinessDto,
      stores: [store],
      currentStoreId: "s1",
      user: { id: "u1", language: "en" } as UserDto,
    });
    await i18n.changeLanguage("en");
  });

  it("the document language comes from the country: pt-AO", () => {
    expect(i18n.language).toBe("en");
    expect(documentLanguage()).toBe("pt-AO");
    setSession({ stores: [{ ...store, documentLanguage: "pt-BR" }] });
    expect(documentLanguage()).toBe("pt-BR");
    setSession({ stores: [store] });
  });

  it("the invoice (Factura-Recibo) is in Portuguese, dates DD/MM/YYYY", () => {
    const html = renderToStaticMarkup(<FiscalA4 doc={doc} />);
    expect(html).toContain("Factura-Recibo");
    expect(html).toContain("Total Ilíquido");
    expect(html).toContain("Total Imposto");
    expect(html).toContain("17/10/2026");
    expect(html).not.toContain("2026-10-17");
    expectNoEnglish(html, englishOnly(en.fiscal, ptDocuments.fiscal));
  });

  it("bank accounts frozen on the document print as Coordenadas bancárias, IBAN in fours; older documents print none", () => {
    const bankAccounts = [{ bankName: "Banco BAI", accountHolder: "Demo Lda", iban: "AO03000600000012345678901" }];
    const html = renderToStaticMarkup(<FiscalA4 doc={{ ...doc, seller: { ...doc.seller, bankAccounts } }} />);
    expect(html).toContain("Coordenadas bancárias");
    expect(html).toContain("Demo Lda");
    expect(html).toContain("AO03 0006 0000 0012 3456 7890 1");
    expect(renderToStaticMarkup(<FiscalA4 doc={doc} />)).not.toContain("Coordenadas bancárias");

    const quote = renderToStaticMarkup(<A4Document title="ORÇAMENTO" meta={[]} store={store} lines={[]} bankAccounts={bankAccounts} />);
    expect(quote).toContain("Coordenadas bancárias");
    expect(quote).toContain("AO03 0006 0000 0012 3456 7890 1");
  });

  it("a quote says its prices are without IVA, and shows the shelf price when prices include IVA (tester #22)", () => {
    // 150 and 100 Kz on the shelf, IVA 14% included: what the pricing gives.
    const row = (key: string, price: number, tax: number) =>
      documentLine({ key, name: key, sku: null, quantity: 1, unit: "un", taxRate: 14, exemptionCode: null, unitPrice: price, gross: price, lineDiscount: 0, discount: 0, net: price - tax, tax, total: price }, true);
    const lines = [row("Sumo", 150, 18.43), row("Pão", 100, 12.29)];
    const html = renderToStaticMarkup(<A4Document title="ORÇAMENTO" meta={[]} store={store} lines={lines} pricesIncludeTax />);
    expect(html).toContain("Preço unit. s/ IVA");
    expect(html).toContain("Valor s/ IVA");
    expect(html).toContain("Preço c/ IVA");
    expect(html).toMatch(/150,00/);
    expect(html).toMatch(/131,57/);
    expect(html).toMatch(/250,00/);
    expect(renderToStaticMarkup(<A4Document title="ORÇAMENTO" meta={[]} store={store} lines={lines} />)).not.toContain("Preço c/ IVA");
  });

  it("a report on A4 (and its PDF) is in Portuguese", () => {
    const data: ReportResultDto = {
      report: "salesByDay", startDate: "2026-10-01", endDate: "2026-10-31", storeId: "s1",
      tables: [{ columns: [{ key: "period", kind: "date" }, { key: "documents", kind: "count" }, { key: "net", kind: "money" }, { key: "tax", kind: "money" }, { key: "gross", kind: "money" }], rows: [{ period: "2026-10-17", documents: 3, net: "1000", tax: "140", gross: "1140" }], totals: { documents: 3, net: "1000", tax: "140", gross: "1140" } }],
    };
    function Report() {
      const f = useCellFormatters(documentLanguage());
      return <ReportA4 data={data} storeName="Loja Central" f={f} lang={documentLanguage()} />;
    }
    const html = renderToStaticMarkup(<Report />);
    expect(html).toContain(ptReports.tables.names.salesByDay);
    expect(html).toContain("01/10/2026");
    expect(html).toContain("17/10/2026");
    expectNoEnglish(html, englishOnly({ names: enReports.tables.names, columns: enReports.tables.columns, total: enReports.tables.total, generatedAt: enReports.tables.generatedAt }, { names: ptReports.tables.names, columns: ptReports.tables.columns, total: ptReports.tables.total, generatedAt: ptReports.tables.generatedAt }));
  });

  it("the shift close report is in Portuguese", () => {
    const summary: ShiftSummaryDto = {
      salesCount: 2, salesTotal: "1290", byMethod: { CASH: "1290" }, discounts: "0", voided: { count: 0, total: "0" }, returns: { count: 0, total: "0", cash: "0" },
      cashIn: "0", cashOut: "0", movements: [], byCashier: [{ id: "u1", name: "Ana", count: 2, total: "1290" }], expectedCash: "6290",
    };
    const html = renderToStaticMarkup(
      <ShiftReport
        store={store}
        data={{ openedBy: "Ana", openedAt: "2026-10-17T08:00:00Z", closedBy: "Ana", closedAt: "2026-10-17T17:00:00Z", openingFloat: 5000, countedCash: 6290, expectedCash: 6290, summary }}
      />,
    );
    expect(html).toContain(ptShifts.report.title);
    expectNoEnglish(html, englishOnly(enShifts.report, ptShifts.report));
  });
});
