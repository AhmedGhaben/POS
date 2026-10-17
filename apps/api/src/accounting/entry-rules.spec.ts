import { archivalNumber, D, description200, lineProblems, mergeLines, normaliseLines, transactionId } from "./entry-rules";

describe("entry rules", () => {
  it("a balanced entry with a debit and a credit line has no problems", () => {
    expect(lineProblems([{ accountId: "a", debit: 100 }, { accountId: "b", credit: "60.50" }, { accountId: "c", credit: "39.50" }])).toEqual([]);
  });

  it("refuses unbalanced entries, one-sided entries, lines with both sides or none, negatives and cents of cents", () => {
    expect(lineProblems([{ accountId: "a", debit: 100 }, { accountId: "b", credit: 99.99 }])).toEqual(["The entry doesn't balance: debits 100.00, credits 99.99"]);
    expect(lineProblems([{ accountId: "a", debit: 100 }])).toContain("An entry needs at least two lines");
    expect(lineProblems([{ accountId: "a", debit: 50 }, { accountId: "b", debit: 50 }])).toContain("An entry needs at least one debit and one credit line");
    expect(lineProblems([{ accountId: "a", debit: 10, credit: 10 }, { accountId: "b", credit: 0 }])).toContain("Line 1: a line is either a debit or a credit");
    expect(lineProblems([{ accountId: "a", debit: -10 }, { accountId: "b", credit: -10 }])).toContain("Line 1: amounts can't be negative");
    expect(lineProblems([{ accountId: "a", debit: "10.005" }, { accountId: "b", credit: "10.005" }])).toContain("Line 1: amounts have at most two decimals");
  });

  it("adds up in decimals, not floats (0.1 + 0.2)", () => {
    expect(lineProblems([{ accountId: "a", debit: 0.1 }, { accountId: "a", debit: 0.2 }, { accountId: "b", credit: 0.3 }])).toEqual([]);
  });

  it("merges lines on the same account and nets debits against credits", () => {
    const merged = mergeLines(normaliseLines([
      { accountId: "cash", debit: 10, sourceDocumentId: "FR 1" },
      { accountId: "cash", debit: 5, sourceDocumentId: "FR 1" },
      { accountId: "sales", credit: 20 },
      { accountId: "sales", debit: 5 },
    ]));
    expect(merged.map((l) => [l.accountId, l.debit.toFixed(2), l.credit.toFixed(2)])).toEqual([["cash", "15.00", "0.00"], ["sales", "0.00", "15.00"]]);
    expect(mergeLines(normaliseLines([{ accountId: "x", debit: 5 }, { accountId: "x", credit: 5 }]))).toEqual([]);
    expect(mergeLines(normaliseLines([{ accountId: "c", debit: 1, sourceDocumentId: "FR 1" }, { accountId: "c", debit: 2, sourceDocumentId: "FR 2" }]), { bySource: false })[0].debit).toEqual(D(3));
  });

  it("SAF-T keys: TransactionID = date, journal and archival number, separated by spaces", () => {
    expect(archivalNumber(2026, 57)).toBe("2026/57");
    expect(transactionId("2026-10-17", "VEN", "2026/57")).toBe("2026-10-17 VEN 2026/57");
    expect(transactionId("2026-10-17", "VEN", "2026/57")).toMatch(/^[1-9][0-9]{3}-[01][0-9]-[0-3][0-9] [^ ]{1,30} [^ ]{1,20}$/);
    expect(Array.from(description200("x".repeat(300)))).toHaveLength(200);
  });
});
