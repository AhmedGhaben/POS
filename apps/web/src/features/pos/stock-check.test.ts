import { describe, expect, it } from "vitest";
import { checkStock, isOutOfStock, type StockLevels } from "./stock-check";

/** Tester #32: the till only found out at Charge that there wasn't enough. */
describe("stock check at the till", () => {
  const chocolate = { id: "choc", trackStock: true };
  const service = { id: "svc", trackStock: false };
  const levels = (current: boolean): StockLevels => ({ byProduct: new Map([["choc", 3], ["gone", 0]]), current });

  it("lets anything through within the stock, and services always", () => {
    expect(checkStock(chocolate, 3, levels(true), false)).toEqual({ status: "ok" });
    expect(checkStock(service, 99, levels(true), false)).toEqual({ status: "ok" });
  });

  it("refuses beyond the stock with current figures, unless the business allows it", () => {
    expect(checkStock(chocolate, 4, levels(true), false)).toEqual({ status: "block", available: 3 });
    expect(checkStock(chocolate, 4, levels(true), true)).toEqual({ status: "warn", available: 3 });
  });

  it("only warns with a saved copy (offline or old): the sale must still go through", () => {
    expect(checkStock(chocolate, 4, levels(false), false)).toEqual({ status: "warn", available: 3 });
  });

  it("knows nothing, says nothing", () => {
    expect(checkStock(chocolate, 4, null, false)).toEqual({ status: "ok" });
    expect(checkStock({ id: "new", trackStock: true }, 4, levels(true), false)).toEqual({ status: "ok" });
  });

  it("out of stock for the grid: tracked products at 0 or less", () => {
    expect(isOutOfStock({ id: "gone", trackStock: true }, levels(true))).toBe(true);
    expect(isOutOfStock(chocolate, levels(true))).toBe(false);
    expect(isOutOfStock({ id: "gone", trackStock: false }, levels(true))).toBe(false);
    expect(isOutOfStock({ id: "gone", trackStock: true }, null)).toBe(false);
  });
});
