import { describe, expect, it } from "vitest";
import { centsToInput, centsToNumber, decimalToCents, parseCents } from "./amounts";

describe("entry amounts", () => {
  it("reads amounts as people type them, in whole cents", () => {
    expect(parseCents("1234,56")).toBe(123456);
    expect(parseCents("1 234,56")).toBe(123456);
    expect(parseCents("1.234,56")).toBe(123456);
    expect(parseCents("1,234.56")).toBe(123456);
    expect(parseCents("1234.5")).toBe(123450);
    expect(parseCents("150000")).toBe(15000000);
    expect(parseCents("150.000")).toBe(15000000); // thousands separator, no decimals
    expect(parseCents("")).toBe(0);
  });

  it("refuses anything that isn't an amount with up to two decimals", () => {
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("-10")).toBeNull();
    expect(parseCents("10,5x")).toBeNull();
  });

  it("adds up without float errors and converts back", () => {
    expect(parseCents("0,1")! + parseCents("0,2")!).toBe(parseCents("0,3"));
    expect(centsToNumber(30)).toBe(0.3);
    expect(centsToInput(123456)).toBe("1234.56");
    expect(decimalToCents("1234.56")).toBe(123456);
  });
});
