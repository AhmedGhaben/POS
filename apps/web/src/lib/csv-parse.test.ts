import { describe, expect, it } from "vitest";
import { parseCsv, parseLooseNumber } from "./csv-parse";

describe("parseCsv", () => {
  it("reads quoted fields with commas, escaped quotes and newlines", () => {
    const { rows } = parseCsv('Name,Note\n"Tea, green","Say ""hi""\nthen leave"\n');
    expect(rows).toEqual([
      ["Name", "Note"],
      ["Tea, green", 'Say "hi"\nthen leave'],
    ]);
  });

  it("handles CRLF, a BOM, and a last line without a newline", () => {
    const { rows } = parseCsv("﻿a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("detects semicolon-separated files (European Excel)", () => {
    const { rows, delimiter } = parseCsv("Name;Sell price\nCafé;2,50\n");
    expect(delimiter).toBe(";");
    expect(rows[1]).toEqual(["Café", "2,50"]);
  });

  it("detects tabs and skips blank lines", () => {
    const { rows, delimiter } = parseCsv("a\tb\n\n1\t2\n\t\n");
    expect(delimiter).toBe("\t");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseLooseNumber", () => {
  it.each([
    ["12", 12],
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["1,234.50", 1234.5],
    ["1.234,50", 1234.5],
    ["1 234,5", 1234.5],
    ["1 234,50", 1234.5],
    ["1 234,50 €", 1234.5],
    ["€ 3.99", 3.99],
    ["$1,000,000", 1000000],
    ["-2", -2],
  ])("%s → %d", (raw, expected) => {
    expect(parseLooseNumber(raw)).toBe(expected);
  });

  it("returns null for blank and NaN for junk", () => {
    expect(parseLooseNumber("  ")).toBeNull();
    expect(parseLooseNumber("abc")).toBeNaN();
    expect(parseLooseNumber("1.2.3")).toBeNaN();
  });
});
