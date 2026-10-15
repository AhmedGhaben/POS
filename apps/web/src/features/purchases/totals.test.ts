import { describe, expect, it } from "vitest";
import { purchaseTotals } from "./totals";

describe("purchase totals", () => {
  it("net from the lines, IVA 14%, IVA cativo 50%", () => {
    expect(purchaseTotals([{ quantity: 10, unitCost: 100 }], 14, 50)).toEqual({ net: 1000, tax: 140, total: 1140, withheld: 70, payable: 1070 });
  });

  it("no IVA, decimal quantities, rounding to the cent", () => {
    expect(purchaseTotals([{ quantity: "0.765", unitCost: "12.5" }], 0, 0)).toEqual({ net: 9.56, tax: 0, total: 9.56, withheld: 0, payable: 9.56 });
    expect(purchaseTotals([{ quantity: 1, unitCost: 100.05 }], 14, 0).tax).toBe(14.01);
  });
});
