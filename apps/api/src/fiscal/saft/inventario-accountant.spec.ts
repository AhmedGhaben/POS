import { Prisma } from "@prisma/client";
import { accountantSheets, AccountantSale } from "./accountant";
import { DRAFT_CSV, inventoryRows } from "./inventario";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe("SAF-T de Inventários (draft format)", () => {
  const products = new Map([
    ["p1", { sku: "OLEO-1L", name: 'Óleo "Palma"; 1L', barcode: "5601234567890", unit: "un", inventoryType: "M" }],
    ["p2", { sku: "ARROZ", name: "Arroz agulha", barcode: null, unit: "kg", inventoryType: null }],
    ["p3", { sku: "ZERO", name: "Esgotado", barcode: null, unit: "un", inventoryType: "M" }],
  ]);

  it("adds up the stores, leaves out what isn't held, values at average cost", () => {
    const rows = inventoryRows(
      [
        { productId: "p1", quantity: D(10), averageCost: D("7.5") },
        { productId: "p1", quantity: D(4), averageCost: D("8.125") },
        { productId: "p2", quantity: D("12.345"), averageCost: D("1.2345") },
        { productId: "p3", quantity: D(0), averageCost: D(3) },
        { productId: "p3", quantity: D(-2), averageCost: D(3) },
      ],
      products,
    );
    expect(rows.map((r) => [r.code, r.quantity.toString(), r.bookValue.toFixed(2), r.category])).toEqual([
      ["ARROZ", "12.345", "15.24", "M"],
      ["OLEO-1L", "14", "107.50", "M"],
    ]);
  });

  it("writes a semicolon CSV with a header; no stock is the header alone", () => {
    const rows = inventoryRows([{ productId: "p1", quantity: D(2), averageCost: D(5) }], products);
    const csv = DRAFT_CSV.write({ date: "2026-12-31", companyTaxId: "5417000123", costingMethod: "CMP", rows });
    expect(csv).toBe(
      "ProductCategory;ProductCode;ProductDescription;ProductNumberCode;ClosingStockQuantity;UnitOfMeasure;ClosingStockValue;CostingMethod\r\n" +
        'M;OLEO-1L;"Óleo ""Palma""; 1L";5601234567890;2;un;10.00;CMP\r\n',
    );
    expect(DRAFT_CSV.write({ date: "2026-12-31", companyTaxId: "5417000123", costingMethod: "CMP", rows: [] }).split("\r\n")).toHaveLength(2);
  });
});

describe("Accountant export", () => {
  const sale = (over: Partial<AccountantSale> = {}): AccountantSale => ({
    date: "2026-10-31",
    documentNo: "FR WEB1-2026/1",
    documentType: "FR",
    status: "N",
    store: "Loja Talatona",
    buyerTaxId: "999999999",
    buyerName: "Consumidor Final",
    taxes: [{ code: "NOR", percentage: D(14), region: "AO", base: D("17.54"), tax: D("2.46") }],
    netTotal: D("17.54"),
    taxPayable: D("2.46"),
    grossTotal: D(20),
    paymentStatus: "Pago",
    ...over,
  });

  it("one row per document with base and IVA per rate; credit notes subtract, annulled count for nothing", () => {
    const [vendas, compras, movimentos] = accountantSheets({
      companyName: "Kianda",
      companyTaxId: "5417000123",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      sales: [
        sale({
          taxes: [
            { code: "NOR", percentage: D(14), region: "AO", base: D("17.54"), tax: D("2.46") },
            { code: "RED", percentage: D(5), region: "AO", base: D("9.52"), tax: D("0.48") },
            { code: "ISE", percentage: D(0), region: "AO", base: D(5), tax: D(0), exemptionCode: "M10" },
          ],
          netTotal: D("32.06"),
          taxPayable: D("2.94"),
          grossTotal: D(35),
        }),
        sale({ documentNo: "NC WEB1-2026/1", documentType: "NC", paymentStatus: "" }),
        sale({ documentNo: "FR WEB1-2026/2", status: "A" }),
      ],
      purchases: [],
      movements: [{ date: "2026-10-31", documentNo: "FR WEB1-2026/1", kind: "Recebimento", taxId: "999999999", name: "Consumidor Final", method: "Numerário", amount: D(35) }],
    });
    expect(vendas.header).toEqual([
      "Data", "Documento", "Tipo", "Estado", "Loja", "NIF", "Cliente",
      "Base 14%", "IVA 14%", "Base 5%", "IVA 5%", "Base isenta", "Motivos de isenção", "Total sem IVA", "IVA", "Total", "Pagamento",
    ]);
    expect(vendas.rows[0]).toEqual([{ date: "2026-10-31" }, "FR WEB1-2026/1", "Factura-Recibo", "Normal", "Loja Talatona", "999999999", "Consumidor Final", 17.54, 2.46, 9.52, 0.48, 5, "M10", 32.06, 2.94, 35, "Pago"]);
    expect(vendas.rows[1].slice(7, 9)).toEqual([-17.54, -2.46]);
    expect(vendas.rows[2][3]).toBe("Anulado");
    expect(vendas.rows[2].slice(13, 16)).toEqual([0, 0, 0]);
    expect(vendas.rows[3]).toEqual(["Total", null, null, null, null, null, null, 0, 0, 9.52, 0.48, 5, null, 14.52, 0.48, 15, null]);
    expect(compras.rows).toEqual([["Total", null, null, null, null, null, 0, 0, 0, 0, 0, null, null]]);
    expect(movimentos.rows[1]).toEqual(["Total", null, null, null, null, null, 35]);
  });

  it("purchases with the supplier's document, and the IVA return's supplier annex (AGT's example)", () => {
    const sheets = accountantSheets({
      companyName: "K",
      companyTaxId: "5417000123",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      sales: [],
      purchases: [
        {
          date: "2026-10-10",
          number: "PO-1",
          supplierDocType: "FT",
          supplierDocumentNo: "FT 2019A1/12360",
          supplierDocDate: "2026-10-09",
          supplierTaxId: "1234567890",
          supplierName: "Fornecedor Exemplo",
          store: "Loja",
          netTotal: D(300000),
          taxTotal: D(42000),
          total: D(342000),
          status: "Recebida",
          paymentStatus: "Parcialmente pago",
          taxLines: [
            { base: D(200000), taxAmount: D(28000), deductiblePercent: D(100), deductibleAmount: D(28000), typology: "MFI" },
            { base: D(100000), taxAmount: D(14000), deductiblePercent: D(100), deductibleAmount: D(14000), typology: "INV" },
          ],
          withholdingPercent: D(50),
          withholdingAmount: D(21000),
        },
      ],
      movements: [],
    });
    expect(sheets.map((s) => s.name)).toEqual(["Vendas", "Compras", "Recebimentos e pagamentos", "Anexo Fornecedores"]);
    expect(sheets[1].rows[0]).toEqual([{ date: "2026-10-10" }, "PO-1", "FT 2019A1/12360", "1234567890", "Fornecedor Exemplo", "Loja", 300000, 42000, 42000, 21000, 342000, "Recebida", "Parcialmente pago"]);
    const annex = sheets[3];
    expect(annex.header[0]).toBe("Nº Ordem");
    expect(annex.rows).toEqual([
      [{ int: 1 }, "1234567890", "Fornecedor Exemplo", "FT", { date: "2026-10-09" }, "FT 2019A1/12360", 342000, 200000, 28000, 100, 28000, "MFI", 50, 14000, null],
      [{ int: 2 }, "1234567890", "Fornecedor Exemplo", "FT", { date: "2026-10-09" }, "FT 2019A1/12360", 342000, 100000, 14000, 100, 14000, "INV", 50, 7000, null],
    ]);
  });

  it("Cabinda's 1% gets its own column", () => {
    const [vendas] = accountantSheets({
      companyName: "K",
      companyTaxId: "5417000123",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      sales: [sale({ taxes: [{ code: "OUT", percentage: D(1), region: "AO-CAB", base: D(100), tax: D(1) }] })],
      purchases: [],
      movements: [],
    });
    expect(vendas.header.slice(7, 9)).toEqual(["Base 1% (Cabinda)", "IVA 1% (Cabinda)"]);
  });
});
