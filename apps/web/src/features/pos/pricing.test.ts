import { describe, expect, it } from "vitest";
import { discountCents, priceSaleCents } from "@pos/shared";

describe("priceSaleCents", () => {
  it("without discounts: tax per line, rounded to the cent", () => {
    const r = priceSaleCents([
      { unitPrice: 2.99, quantity: 3, taxRate: 14 },
      { unitPrice: 1.05, quantity: 1, taxRate: 0 },
    ]);
    expect(r.lines.map((l) => [l.gross, l.tax, l.total])).toEqual([
      [897, 126, 1023], // 897 x 14% = 125.58
      [105, 0, 105],
    ]);
    expect(r).toMatchObject({ subtotal: 1002, discountTotal: 0, taxTotal: 126, total: 1128 });
  });

  it("line discounts: percent and amount, never more than the line", () => {
    const r = priceSaleCents([
      { unitPrice: 10, quantity: 2, taxRate: 0, discount: { type: "PERCENT", value: 15 } },
      { unitPrice: 4, quantity: 1, taxRate: 0, discount: { type: "AMOUNT", value: 1.5 } },
      { unitPrice: 3, quantity: 1, taxRate: 0, discount: { type: "AMOUNT", value: 99 } },
    ]);
    expect(r.lines.map((l) => l.lineDiscount)).toEqual([300, 150, 300]);
    expect(r.lines[2].net).toBe(0);
    expect(r.total).toBe(1700 + 250);
  });

  it("tax is charged on the discounted amount", () => {
    const r = priceSaleCents([{ unitPrice: 100, quantity: 1, taxRate: 14, discount: { type: "PERCENT", value: 10 } }]);
    expect(r.lines[0]).toMatchObject({ gross: 10000, discount: 1000, net: 9000, tax: 1260, total: 10260 });
  });

  it("a whole-sale discount is shared in proportion, and the shares add up exactly", () => {
    const r = priceSaleCents(
      [
        { unitPrice: 1, quantity: 1, taxRate: 0 },
        { unitPrice: 1, quantity: 1, taxRate: 0 },
        { unitPrice: 1, quantity: 1, taxRate: 0 },
      ],
      { type: "AMOUNT", value: 1 },
    );
    expect(r.lines.map((l) => l.saleDiscountShare)).toEqual([34, 33, 33]);
    expect(r.saleDiscount).toBe(100);
    expect(r.total).toBe(200);
  });

  it("whole-sale percent applies after line discounts", () => {
    const r = priceSaleCents(
      [
        { unitPrice: 50, quantity: 1, taxRate: 0, discount: { type: "AMOUNT", value: 10 } },
        { unitPrice: 60, quantity: 1, taxRate: 0 },
      ],
      { type: "PERCENT", value: 10 },
    );
    // (40 + 60) x 10% = 10, split 4 / 6
    expect(r.lines.map((l) => [l.lineDiscount, l.saleDiscountShare])).toEqual([
      [1000, 400],
      [0, 600],
    ]);
    expect(r).toMatchObject({ subtotal: 11000, saleDiscount: 1000, discountTotal: 2000, total: 9000 });
  });

  it("totals always add up for random carts", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 16807) % 2147483647;
      return seed % n;
    };
    for (let run = 0; run < 500; run++) {
      const lines = Array.from({ length: 1 + rand(6) }, () => ({
        unitPrice: rand(5000) / 100,
        quantity: 1 + rand(5),
        taxRate: [0, 6, 14, 23][rand(4)],
        discount: rand(3) === 0 ? { type: "PERCENT" as const, value: rand(60) } : null,
      }));
      const r = priceSaleCents(lines, rand(2) ? { type: "AMOUNT", value: rand(3000) / 100 } : null);
      expect(r.subtotal - r.discountTotal + r.taxTotal).toBe(r.total);
      expect(r.lines.reduce((a, l) => a + l.saleDiscountShare, 0)).toBe(r.saleDiscount);
      for (const l of r.lines) expect(l.net).toBeGreaterThanOrEqual(0);
    }
  });

  it("discountCents ignores empty or negative discounts", () => {
    expect(discountCents(1000, null)).toBe(0);
    expect(discountCents(1000, { type: "PERCENT", value: 0 })).toBe(0);
    expect(discountCents(1000, { type: "AMOUNT", value: -5 })).toBe(0);
    expect(discountCents(1000, { type: "PERCENT", value: 150 })).toBe(1000);
  });
});
