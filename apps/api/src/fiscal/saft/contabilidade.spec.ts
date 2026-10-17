import { Prisma } from "@prisma/client";
import { buildSaftXml, FacturacaoInput, GeneralLedgerInput } from "./facturacao";
import { saftSchemaErrors } from "./testing/validate-saft";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const zero = { openingDebit: D(0), openingCredit: D(0), closingDebit: D(0), closingCredit: D(0) };

const ledger = (): GeneralLedgerInput => ({
  accounts: [
    { id: "45", description: "Caixa", ...zero, closingDebit: D(114), category: "GR" },
    { id: "45.1", description: "Fundo fixo de caixa", ...zero, closingDebit: D(114), category: "GA", groupingCode: "45" },
    { id: "45.1.1", description: "Caixa principal", ...zero, closingDebit: D(114), category: "GM", groupingCode: "45.1" },
    { id: "61", description: "Vendas", ...zero, closingCredit: D(100), category: "GR" },
    { id: "61.3", description: "Mercadorias", ...zero, closingCredit: D(100), category: "GA", groupingCode: "61" },
    { id: "61.3.1", description: "Mercadorias – IVA 14%", ...zero, closingCredit: D(100), category: "GM", groupingCode: "61.3" },
    { id: "34", description: "Estado", ...zero, closingCredit: D(14), category: "GR" },
    { id: "34.5", description: "IVA", ...zero, closingCredit: D(14), category: "GA", groupingCode: "34" },
    { id: "34.5.3", description: "IVA liquidado", ...zero, closingCredit: D(14), category: "GA", groupingCode: "34.5" },
    { id: "34.5.3.1", description: "IVA liquidado – 14%", ...zero, closingCredit: D(14), category: "GM", groupingCode: "34.5.3" },
  ],
  journals: [
    {
      id: "VEN",
      description: "Vendas",
      transactions: [
        {
          id: "2026-10-17 VEN 2026/1",
          period: 10,
          date: "2026-10-17",
          sourceId: "user1",
          description: "Factura-Recibo FR POS001-2026/1",
          docArchivalNumber: "2026/1",
          type: "N",
          postingDate: "2026-10-17",
          customerId: "c2",
          lines: [
            { recordId: "l3", accountId: "34.5.3.1", sourceDocumentId: "FR POS001-2026/1", systemEntryDateTime: "2026-10-17T10:00:00", description: "IVA", credit: D(14) },
            { recordId: "l1", accountId: "45.1.1", sourceDocumentId: "FR POS001-2026/1", systemEntryDateTime: "2026-10-17T10:00:00", description: "Caixa", debit: D(114) },
            { recordId: "l2", accountId: "61.3.1", sourceDocumentId: "FR POS001-2026/1", systemEntryDateTime: "2026-10-17T10:00:00", description: "Vendas", credit: D(100) },
          ],
        },
      ],
    },
  ],
});

const input = (over: Partial<FacturacaoInput> = {}): FacturacaoInput => ({
  taxAccountingBasis: "I",
  generalLedger: ledger(),
  company: { taxId: "5417000123", companyId: "5417000123", legalName: "Kianda & Filhos, Lda", address: { detail: "Rua da Missão 12", city: "Luanda" } },
  software: { producerTaxId: "5000000000", productId: "POS/POS Software", version: "0.2.3", validationNumber: "0" },
  fiscalYear: 2026,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  dateCreated: "2027-01-15",
  taxEntity: "Sede",
  customers: [{ id: "c2", accountId: "31.1.2.1.0001", taxId: "5000123456", name: "Kianda Comércio", finalConsumer: false, address: { detail: "Av. 4 de Fevereiro", city: "Luanda" } }],
  suppliers: [],
  products: [{ code: "OLEO-1L", type: "P", description: "Óleo 1L", numberCode: "OLEO-1L" }],
  taxTable: [{ type: "IVA", region: "AO", code: "NOR", percentage: D(14), description: "Taxa geral" }],
  salesInvoices: [
    {
      documentNo: "FR POS001-2026/1",
      transactionId: "2026-10-17 VEN 2026/1",
      documentType: "FR",
      status: "N",
      statusDateTime: "2026-10-17T10:00:00",
      statusSourceId: "user1",
      sourceBilling: "P",
      hash: "a".repeat(172),
      hashControl: "0",
      period: 10,
      date: "2026-10-17",
      systemEntryDateTime: "2026-10-17T10:00:00",
      sourceId: "user1",
      customerId: "c2",
      lines: [{ lineNumber: 1, productCode: "OLEO-1L", description: "Óleo 1L", quantity: D(1), unit: "un", unitPrice: D(100), netAmount: D(100), tax: { type: "IVA", region: "AO", code: "NOR", percentage: D(14) }, settlementAmount: D(0) }],
      taxPayable: D(14),
      netTotal: D(100),
      grossTotal: D(114),
      payments: [{ mechanism: "NU", amount: D(114), date: "2026-10-17" }],
    },
  ],
  workingDocuments: [],
  payments: [],
  purchaseInvoices: [],
  ...over,
});

describe("SAF-T (AO) integrated accounting file (I)", () => {
  it("chart, entries and invoices linked by TransactionID: valid against the official XSD", async () => {
    const xml = buildSaftXml(input());
    expect(await saftSchemaErrors(xml)).toEqual([]);
    expect(xml).toContain("<TaxAccountingBasis>I</TaxAccountingBasis>");
    expect(xml).toContain("<TaxEntity>Sede</TaxEntity>");
    expect(xml).toMatch(/<GeneralLedgerEntries>\s*<NumberOfEntries>1<\/NumberOfEntries>\s*<TotalDebit>114.00<\/TotalDebit>\s*<TotalCredit>114.00<\/TotalCredit>/);
    expect(xml).toMatch(/<SystemEntryDate>2026-10-17T10:00:00<\/SystemEntryDate>\s*<TransactionID>2026-10-17 VEN 2026\/1<\/TransactionID>\s*<CustomerID>c2<\/CustomerID>/);
    expect(xml).toContain("<AccountID>31.1.2.1.0001</AccountID>");
    // Debit lines come before credit lines, whatever their order in the entry.
    const lines = xml.slice(xml.indexOf("<Lines>"), xml.indexOf("</Lines>"));
    expect(lines.indexOf("<DebitLine>")).toBeLessThan(lines.indexOf("<CreditLine>"));
    expect(lines.lastIndexOf("<DebitLine>")).toBeLessThan(lines.indexOf("<CreditLine>"));
  });

  it("the XSD catches an account in an entry that isn't in the chart, and a transaction key that breaks the format", async () => {
    const bad = ledger();
    bad.journals[0].transactions[0].lines[0].accountId = "99.9";
    expect((await saftSchemaErrors(buildSaftXml(input({ generalLedger: bad })))).join(" ")).toMatch(/GeneralLedgerEntriesCreditLineAccountIDConstraint|keyref/i);
    const badId = ledger();
    badId.journals[0].transactions[0].id = "VEN 2026/1";
    expect((await saftSchemaErrors(buildSaftXml(input({ generalLedger: badId, salesInvoices: [] })))).length).toBeGreaterThan(0);
  });
});
