import { describe, expect, it } from "vitest";
import { parseLinePrice } from "./line-price";

/** Tester #39: no negative prices at the till either. */
describe("a price typed at the till", () => {
  it("takes 0 or more with up to 2 decimals", () => {
    expect(parseLinePrice("4,50")).toEqual({ price: 4.5, valid: true });
    expect(parseLinePrice("0")).toEqual({ price: 0, valid: true });
  });

  it("refuses negative and malformed prices", () => {
    expect(parseLinePrice("-1").valid).toBe(false);
    expect(parseLinePrice("1.234").valid).toBe(false);
    expect(parseLinePrice("").valid).toBe(false);
  });
});
