import { Prisma } from "@prisma/client";
import { purchaseTaxes } from "./purchase-taxes";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe("IVA on purchases", () => {
  it("no tax lines: no IVA", () => {
    const t = purchaseTaxes(D(1000), undefined, undefined);
    expect(t.lines).toEqual([]);
    expect(t.taxTotal.toFixed(2)).toBe("0.00");
  });

  it("the supplier annex's example: 200 000 + 100 000 at 14%, 100% deductible, IVA cativo 50%", () => {
    const t = purchaseTaxes(D(300000), [{ taxRate: 14, base: 200000, typology: "MFI" }, { taxRate: 14, base: 100000, typology: "INV" }], 50);
    expect(t.lines.map((l) => [l.base.toFixed(2), l.taxAmount.toFixed(2), l.deductibleAmount.toFixed(2), l.typology])).toEqual([
      ["200000.00", "28000.00", "28000.00", "MFI"],
      ["100000.00", "14000.00", "14000.00", "INV"],
    ]);
    expect(t.taxTotal.toFixed(2)).toBe("42000.00");
    expect(t.withholdingAmount.toFixed(2)).toBe("21000.00");
  });

  it("rounds to the cent, keeps the supplier's own figure, deducts part", () => {
    const t = purchaseTaxes(D("100.05"), [{ taxRate: 14, base: 100.05, deductiblePercent: 50 }], undefined);
    expect(t.lines[0].taxAmount.toFixed(2)).toBe("14.01");
    expect(t.lines[0].deductibleAmount.toFixed(2)).toBe("7.01");
    expect(purchaseTaxes(D("100.05"), [{ taxRate: 14, base: 100.05, taxAmount: 14 }], undefined).taxTotal.toFixed(2)).toBe("14.00");
  });

  it("bases must add up to the purchase without IVA; IVA cativo needs IVA", () => {
    expect(() => purchaseTaxes(D(100), [{ taxRate: 14, base: 90 }], undefined)).toThrow("add up");
    expect(() => purchaseTaxes(D(100), [{ taxRate: 0, base: 100 }], 50)).toThrow("IVA cativo");
  });
});
