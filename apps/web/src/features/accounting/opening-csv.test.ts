import { describe, expect, it } from "vitest";
import { parseOpeningCsv } from "./opening-csv";

const accounts = [
  { id: "a1", code: "11.5", category: "GM", isActive: true },
  { id: "a2", code: "45.1.1", category: "GM", isActive: true },
  { id: "a3", code: "51.1", category: "GM", isActive: true },
  { id: "a4", code: "51", category: "GR", isActive: true },
];

describe("opening balances from a spreadsheet", () => {
  it("reads code; debit; credit rows, skips the header and empty rows, in cents", () => {
    const rows = parseOpeningCsv("Conta;Débito;Crédito\n11.5;800 000,00;\n45.1.1;2000,5;\n\n51.1;;802000,50\n", accounts);
    expect(rows).toEqual([
      { line: 2, code: "11.5", debit: 80000000, credit: 0, accountId: "a1", error: null },
      { line: 3, code: "45.1.1", debit: 200050, credit: 0, accountId: "a2", error: null },
      { line: 4, code: "51.1", debit: 0, credit: 80200050, accountId: "a3", error: null },
    ]);
  });

  it("flags unknown accounts, aggregating accounts, bad amounts and both sides", () => {
    const rows = parseOpeningCsv("99.9;10;\n51;;10\n11.5;abc;\n45.1.1;5;5\n", accounts);
    expect(rows.map((r) => r.error)).toEqual(["unknownAccount", "notMovement", "amount", "bothSides"]);
  });
});
