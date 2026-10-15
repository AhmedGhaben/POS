import { Prisma } from "@prisma/client";
import { buildFacturacaoXml, FacturacaoInput, SaftDocument, SaftLine } from "./facturacao";
import { saftSchemaErrors } from "./testing/validate-saft";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const line = (over: Partial<SaftLine> = {}): SaftLine => ({
  lineNumber: 1,
  productCode: "OLEO-1L",
  description: "Óleo de palma 1L",
  quantity: D(2),
  unit: "un",
  unitPrice: D("8.77193"),
  netAmount: D("17.54"),
  tax: { type: "IVA", region: "AO", code: "NOR", percentage: D(14) },
  settlementAmount: D(0),
  ...over,
});

const doc = (over: Partial<SaftDocument> = {}): SaftDocument => ({
  documentNo: "FR WEB1-2026/1",
  documentType: "FR",
  status: "N",
  statusDateTime: "2026-10-31T23:30:00",
  statusSourceId: "user1",
  sourceBilling: "P",
  hash: "a".repeat(172),
  hashControl: "0",
  period: 10,
  date: "2026-10-31",
  systemEntryDateTime: "2026-10-31T23:30:00",
  sourceId: "user1",
  customerId: "cf",
  lines: [line()],
  taxPayable: D("2.46"),
  netTotal: D("17.54"),
  grossTotal: D(20),
  payments: [{ mechanism: "NU", amount: D(20), date: "2026-10-31" }],
  ...over,
});

const input = (over: Partial<FacturacaoInput> = {}): FacturacaoInput => ({
  company: {
    taxId: "5417000123",
    companyId: "5417000123",
    legalName: "Kianda & Filhos, Lda",
    businessName: "Mercearia Kianda",
    address: { detail: "Rua da Missão 12", city: "Luanda", province: "Luanda" },
    eacCode: null,
    phone: "+244 923 000 000",
    email: "geral@kianda.ao",
  },
  software: { producerTaxId: "5000000000", productId: "POS/POS Software", version: "0.2.3", validationNumber: "0" },
  fiscalYear: 2026,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  dateCreated: "2026-11-01",
  taxEntity: "Global",
  customers: [
    { id: "cf", taxId: "999999999", name: "Consumidor Final", finalConsumer: true, address: {} },
    { id: "c2", taxId: "5000123456", name: "Kianda Comércio <SA>", finalConsumer: false, address: { detail: "Av. 4 de Fevereiro", city: "Luanda" }, phone: "923111222" },
  ],
  products: [
    { code: "OLEO-1L", type: "P", group: "Mercearia", description: "Óleo de palma 1L", numberCode: "5601234567890" },
    { code: "FUBA", type: "P", description: "Fuba de milho", numberCode: "FUBA" },
  ],
  taxTable: [
    { type: "IVA", region: "AO", code: "NOR", percentage: D(14), description: "Taxa geral" },
    { type: "IVA", region: "AO", code: "ISE", percentage: D(0), description: "Isento" },
  ],
  salesInvoices: [doc()],
  workingDocuments: [],
  payments: [],
  ...over,
});

describe("SAF-T (AO) Facturação file", () => {
  it("a month with one Factura-Recibo is valid against the official XSD", async () => {
    const xml = buildFacturacaoXml(input());
    expect(await saftSchemaErrors(xml)).toEqual([]);
    expect(xml).toContain("<StartDate>2026-10-01</StartDate>");
    expect(xml).toContain("<EndDate>2026-10-31</EndDate>");
    expect(xml).toContain("<FiscalYear>2026</FiscalYear>");
  });

  it("an empty month is still a valid file (no documents, totals 0.00)", async () => {
    const xml = buildFacturacaoXml(input({ salesInvoices: [], customers: [], products: [], taxTable: [] }));
    expect(await saftSchemaErrors(xml)).toEqual([]);
    expect(xml).toMatch(/<NumberOfEntries>0<\/NumberOfEntries>\s*<TotalDebit>0.00<\/TotalDebit>\s*<TotalCredit>0.00<\/TotalCredit>/);
  });

  it("every kind of document: exempt line, discount, credit note, annulled, proforma, receipt", async () => {
    const exempt = line({
      lineNumber: 2,
      productCode: "FUBA",
      description: "Fuba de milho",
      quantity: D("1.5"),
      unit: "kg",
      unitPrice: D(5),
      netAmount: D("7.50"),
      tax: { type: "IVA", region: "AO", code: "ISE", percentage: D(0) },
      exemption: { code: "M10", reason: "Isento nos termos da alínea a) do nº1 do artigo 12.º do CIVA" },
      settlementAmount: D("0.50"),
    });
    const sales = [
      doc({ lines: [line(), exempt], netTotal: D("25.04"), grossTotal: D("27.50") }),
      doc({ documentNo: "FT WEB1-2026/1", documentType: "FT", customerId: "c2", payments: [] }),
      doc({
        documentNo: "NC WEB1-2026/1",
        documentType: "NC",
        payments: [],
        lines: [line({ quantity: D(1), netAmount: D("8.77"), reference: { documentNo: "FR WEB1-2026/1", reason: "Devolução do cliente" } })],
        netTotal: D("8.77"),
        taxPayable: D("1.23"),
        grossTotal: D(10),
      }),
      doc({ documentNo: "FR WEB1-2026/2", status: "A", statusReason: "N - Documento não foi entregue ao cliente nem por ele recebido" }),
    ];
    const xml = buildFacturacaoXml(
      input({
        salesInvoices: sales,
        workingDocuments: [doc({ documentNo: "PF WEB1-2026/1", documentType: "PF", status: "F", payments: [] })],
        payments: [
          {
            paymentRefNo: "RC WEB1-2026/1",
            paymentType: "RC",
            period: 10,
            transactionDate: "2026-10-31",
            status: "N",
            statusDateTime: "2026-10-31T10:00:00",
            statusSourceId: "user1",
            sourceId: "user1",
            systemEntryDateTime: "2026-10-31T10:00:00",
            customerId: "c2",
            methods: [{ mechanism: "TB", amount: D(20), date: "2026-10-31" }],
            lines: [{ lineNumber: 1, originatingOn: "FT WEB1-2026/1", invoiceDate: "2026-10-31", amount: D(20) }],
            netTotal: D(20),
            taxPayable: D(0),
            grossTotal: D(20),
          },
        ],
      }),
    );
    expect(await saftSchemaErrors(xml)).toEqual([]);
    // Credits: FR 1 (17.54 + 7.50) + FT 1 (17.54); the annulled FR 2 is counted but not summed.
    expect(xml).toContain("<NumberOfEntries>4</NumberOfEntries>");
    expect(xml).toContain("<TotalCredit>42.58</TotalCredit>");
    // Debits: the credit note.
    expect(xml).toContain("<TotalDebit>8.77</TotalDebit>");
    expect(xml).toContain("<DebitAmount>8.77</DebitAmount>");
    // N's wording is 58 characters; SAF-T's Reason holds 50.
    expect(xml).toContain("<Reason>N - Documento não foi entregue ao cliente nem por</Reason>");
    expect(xml).toContain("<TaxExemptionCode>M10</TaxExemptionCode>");
    expect(xml).toContain("<SettlementAmount>0.5</SettlementAmount>");
  });

  it("escapes text and fills what the decree says to fill for consumidor final", () => {
    const xml = buildFacturacaoXml(input());
    expect(xml).toContain("<CompanyName>Kianda Comércio &lt;SA&gt;</CompanyName>");
    expect(xml).toContain("<CompanyName>Kianda &amp; Filhos, Lda</CompanyName>");
    const cf = xml.slice(xml.indexOf("<CustomerID>cf</CustomerID>"), xml.indexOf("</Customer>"));
    expect(cf).toContain("<CustomerTaxID>999999999</CustomerTaxID>");
    expect(cf).toContain("<AddressDetail>Desconhecido</AddressDetail>");
    expect(cf).toContain("<Country>Desconhecido</Country>");
  });

  it("a file the schema refuses is caught by the check (the check itself works)", async () => {
    const xml = buildFacturacaoXml(input()).replace("<ProductID>POS/POS Software</ProductID>", "<ProductID>POS</ProductID>");
    expect((await saftSchemaErrors(xml)).join("\n")).toMatch(/ProductID/);
  });
});
