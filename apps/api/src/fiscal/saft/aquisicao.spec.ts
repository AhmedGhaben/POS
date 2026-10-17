import { Prisma } from "@prisma/client";
import { buildSaftXml } from "./facturacao";
import { saftSchemaErrors } from "./testing/validate-saft";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe("SAF-T (AO) Aquisição de Bens e Serviços (A)", () => {
  it("suppliers, tax table and purchases only, with deductible IVA and IVA cativo: valid against the official XSD", async () => {
    const xml = buildSaftXml({
      taxAccountingBasis: "A",
      company: { taxId: "5417000123", companyId: "5417000123", legalName: "Kianda & Filhos, Lda", address: { detail: "Rua da Missão 12", city: "Luanda" } },
      software: { producerTaxId: "5000000000", productId: "POS/POS Software", version: "0.2.3", validationNumber: "0" },
      fiscalYear: 2026,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      dateCreated: "2026-10-05",
      taxEntity: "Global",
      customers: [],
      suppliers: [{ id: "s1", accountId: "32.1.2.1.0001", taxId: "5401234567", name: "Grossista do Kikolo", address: { detail: "Kikolo", city: "Luanda", country: "AO" } }],
      products: [],
      taxTable: [{ type: "IVA", region: "AO", code: "NOR", percentage: D(14), description: "Taxa geral" }],
      salesInvoices: [],
      workingDocuments: [],
      payments: [],
      purchaseInvoices: [
        {
          invoiceNo: "FT GK2026/12",
          hash: "Ab3x",
          sourceId: "user1",
          period: 9,
          date: "2026-09-12",
          purchaseType: "FT",
          supplierId: "s1",
          taxPayable: D(140),
          netTotal: D(1000),
          grossTotal: D(1140),
          deductible: [{ taxBase: D(1000), amount: D(140), percentage: D(100), type: "INV" }],
          withholding: { percent: D(50), amount: D(70) },
        },
      ],
    });
    expect(await saftSchemaErrors(xml)).toEqual([]);
    expect(xml).toContain("<TaxAccountingBasis>A</TaxAccountingBasis>");
    expect(xml).not.toContain("<SalesInvoices>");
    expect(xml).toContain("<DeductibleTaxType>INV</DeductibleTaxType>");
    expect(xml).toContain("<WithholdingTaxAmount>70</WithholdingTaxAmount>");
    expect(xml).toContain("<AccountID>32.1.2.1.0001</AccountID>");
  });
});
