import { describe, expect, it } from "vitest";
import { MAX_LINE_QUANTITY, parseQuantity, splitQuantityPrefix } from "./quantity";

describe("typed quantities", () => {
  it("takes whole numbers for items sold by the unit", () => {
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity(" 12 ")).toBe(12);
    expect(parseQuantity("2,5")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(String(MAX_LINE_QUANTITY + 1))).toBeNull();
  });

  it("takes up to the unit's decimals, with a comma or a point", () => {
    expect(parseQuantity("1,250", 3)).toBe(1.25);
    expect(parseQuantity("0.5", 3)).toBe(0.5);
    expect(parseQuantity("1,2345", 3)).toBeNull();
  });
});

describe("quantity shortcut in the search field", () => {
  it("splits 3*<barcode or name>", () => {
    expect(splitQuantityPrefix("3*5601234567890")).toEqual({ quantity: 3, query: "5601234567890" });
    expect(splitQuantityPrefix("2 * pão")).toEqual({ quantity: 2, query: "pão" });
  });

  it("is 1 without a prefix or with an invalid one", () => {
    expect(splitQuantityPrefix("5601234567890")).toEqual({ quantity: 1, query: "5601234567890" });
    expect(splitQuantityPrefix("0*pão")).toEqual({ quantity: 1, query: "0*pão" });
    expect(splitQuantityPrefix("1,5*batata")).toEqual({ quantity: 1, query: "1,5*batata" });
    expect(splitQuantityPrefix("1,5*batata", 3)).toEqual({ quantity: 1.5, query: "batata" });
  });
});
