import { D, lineProblems, LineInput } from "./entry-rules";
import { keyChain, rateKey } from "./mapping";
import { AccountLookup, documentPlan, DocumentForPosting, MappingError, purchasePlan, reversedLines, shiftDifferencePlan, sumLines } from "./posting-rules";

/** Accounts named after their key, so the lines read like the mapping. */
const lookup: AccountLookup = {
  key: (key, ctx) => (key === "payment.CASH" ? `till:${ctx?.terminalId ?? "main"}` : key),
  customer: (id) => `customer:${id}`,
  supplier: (id) => `supplier:${id}`,
  till: (id) => `till:${id ?? "main"}`,
};

const show = (lines: LineInput[]) =>
  lines.map((l) => `${l.accountId} ${D(l.debit ?? 0).gt(0) ? "D" : "C"} ${D(l.debit ?? 0).plus(D(l.credit ?? 0)).toFixed(2)}`).sort();

const doc = (over: Partial<DocumentForPosting> = {}): DocumentForPosting => ({
  id: "d1",
  documentType: "FR",
  documentNo: "FR POS001-2026/1",
  typeName: "Factura-Recibo",
  date: "2026-10-17",
  terminalId: "t1",
  customerId: null,
  buyerName: "Consumidor Final",
  grossTotal: D("114.00"),
  lines: [{ netAmount: D(100), discountAmount: D(0), productType: "P", taxes: [{ taxType: "IVA", percentage: D(14), amount: D(14), exemptionCode: null }] }],
  payments: [{ method: "CASH", amount: D("114.00") }],
  cogs: D(60),
  ...over,
});

describe("posting rules", () => {
  it("keys: rates by their percentage, unknown rates fall back to 'other', exemption codes to 'exempt'", () => {
    expect(rateKey("14.00")).toBe("14");
    expect(rateKey(0)).toBe("exempt");
    expect(rateKey("2.50")).toBe("2.5");
    expect(keyChain("sales.goods.14")).toEqual(["sales.goods.14"]);
    expect(keyChain("sales.goods.3")).toEqual(["sales.goods.3", "sales.goods.other"]);
    expect(keyChain("sales.services.exempt.M10")).toEqual(["sales.services.exempt.M10", "sales.services.exempt"]);
  });

  it("FR: the payment against sales, IVA and the cost of goods sold, balanced", () => {
    const plan = documentPlan(doc(), lookup);
    expect(plan.journalKind).toBe("SALES");
    expect(show(plan.lines)).toEqual(["till:t1 D 114.00", "sales.goods.14 C 100.00", "iva.liquidado.14 C 14.00", "cogs D 60.00", "stock C 60.00"].sort());
    expect(lineProblems(plan.lines)).toEqual([]);
  });

  it("sales are credited before discount and the discount debited; services and exempt lines have their own accounts", () => {
    const plan = documentPlan(
      doc({
        grossTotal: D("212.00"),
        payments: [{ method: "CARD", amount: D("212.00") }],
        cogs: D(0),
        lines: [
          { netAmount: D(90), discountAmount: D(10), productType: "P", taxes: [{ taxType: "IVA", percentage: D(14), amount: D("12.60"), exemptionCode: null }] },
          { netAmount: D(50), discountAmount: D(0), productType: "S", taxes: [{ taxType: "IVA", percentage: D(14), amount: D(7), exemptionCode: null }] },
          { netAmount: D("52.40"), discountAmount: D(0), productType: "P", taxes: [{ taxType: "IVA", percentage: D(0), amount: D(0), exemptionCode: "M10" }] },
        ],
      }),
      lookup,
    );
    expect(show(plan.lines)).toEqual(
      ["payment.CARD D 212.00", "sales.goods.14 C 100.00", "sales.discounts.goods D 10.00", "sales.services.14 C 50.00", "sales.goods.exempt.M10 C 52.40", "iva.liquidado.14 C 19.60"].sort(),
    );
  });

  it("FT and RC go through the customer's account; an FT without a customer is an error", () => {
    expect(show(documentPlan(doc({ documentType: "FT", customerId: "c1", payments: [] }), lookup).lines)).toContain("customer:c1 D 114.00");
    expect(() => documentPlan(doc({ documentType: "FT", payments: [] }), lookup)).toThrow(MappingError);
    const rc = documentPlan(doc({ documentType: "RC", customerId: "c1", lines: [], cogs: D(0), payments: [{ method: "BANK_TRANSFER", amount: D(114) }] }), lookup);
    expect(rc.journalKind).toBe("BANK");
    expect(show(rc.lines)).toEqual(["customer:c1 C 114.00", "payment.BANK_TRANSFER D 114.00"]);
  });

  it("NC: returns and IVA debited, the refund and what lowered the debt credited, the stock back", () => {
    const plan = documentPlan(doc({ documentType: "NC", customerId: "c1", payments: [{ method: "CASH", amount: D(14) }] }), lookup);
    expect(show(plan.lines)).toEqual(["sales.returns D 100.00", "iva.nc.14 D 14.00", "till:t1 C 14.00", "customer:c1 C 100.00", "stock D 60.00", "cogs C 60.00"].sort());
  });

  it("a cent of rounding between payments and the document goes to the rounding accounts; more is an error", () => {
    const plan = documentPlan(doc({ payments: [{ method: "CASH", amount: D("114.01") }] }), lookup);
    expect(show(plan.lines)).toContain("rounding.gain C 0.01");
    expect(() => documentPlan(doc({ payments: [{ method: "CASH", amount: D(120) }] }), lookup)).toThrow(/doesn't match/);
  });

  it("purchases: stock, deductible and non-deductible IVA, the supplier less IVA cativo", () => {
    const plan = purchasePlan(
      {
        id: "p1",
        documentNo: "FT A/1",
        supplierId: "s1",
        supplierName: "Grossista",
        date: "2026-10-17",
        stockAmount: D(800),
        nonStockAmount: D(200),
        taxLines: [{ taxAmount: D(140), deductibleAmount: D(100), typology: "INV" }],
        total: D(1140),
        withholdingAmount: D(70),
      },
      lookup,
    );
    expect(show(plan.lines)).toEqual(["stock D 800.00", "purchases.nonStock D 200.00", "iva.dedutivel.INV D 100.00", "iva.naoDedutivel D 40.00", "supplier:s1 C 1070.00", "iva.cativo C 70.00"].sort());
    expect(lineProblems(plan.lines)).toEqual([]);
  });

  it("shift differences: a surplus is a gain, a shortfall a loss, against the till's cash", () => {
    expect(show(shiftDifferencePlan({ terminalId: "t1", tillName: "POS-001", date: "2026-10-17", difference: D(5) }, lookup).lines)).toEqual(["cash.over C 5.00", "till:t1 D 5.00"]);
    expect(show(shiftDifferencePlan({ terminalId: "t1", tillName: "POS-001", date: "2026-10-17", difference: D(-3) }, lookup).lines)).toEqual(["cash.short D 3.00", "till:t1 C 3.00"]);
  });

  it("a daily summary adds up the day's documents per account; a reversal swaps sides", () => {
    const a = documentPlan(doc(), lookup);
    const b = documentPlan(doc({ id: "d2", documentNo: "FR POS001-2026/2" }), lookup);
    expect(show(sumLines([a, b]))).toEqual(["till:t1 D 228.00", "sales.goods.14 C 200.00", "iva.liquidado.14 C 28.00", "cogs D 120.00", "stock C 120.00"].sort());
    expect(show(reversedLines(a.lines))).toEqual(["till:t1 C 114.00", "sales.goods.14 D 100.00", "iva.liquidado.14 D 14.00", "cogs C 60.00", "stock D 60.00"].sort());
  });
});
