import { describe, expect, it } from "vitest";
import { cleanCounts, countTotal, denominationsFor } from "./denominations";

describe("counting the drawer by note and coin", () => {
  it("has the Kwanza notes and coins, and nothing for other currencies", () => {
    expect(denominationsFor("AOA")?.notes).toContain(5000);
    expect(denominationsFor("AOA")?.coins).toContain(1);
    expect(denominationsFor("XYZ")).toBeNull();
    expect(denominationsFor(undefined)).toBeNull();
  });

  it("adds the count up exactly", () => {
    expect(countTotal({ "5000": 3, "200": 4, "1": 7 })).toBe(15807);
    expect(countTotal({ "0.1": 3 })).toBe(0.3);
    expect(countTotal({})).toBe(0);
  });

  it("keeps whole numbers, drops blanks and zeros, refuses anything else", () => {
    expect(cleanCounts({ "5000": "3", "200": "", "100": "0" })).toEqual({ "5000": 3 });
    expect(cleanCounts({ "5000": "1.5" })).toBeNull();
    expect(cleanCounts({ "5000": "-2" })).toBeNull();
  });
});
