import { D } from "./entry-rules";
import { ageBucket, balanceSheet, incomeStatement } from "./statements";

const b = (code: string, balance: number) => ({ code, balance: D(balance) });
const amount = (lines: { key: string; amount: unknown }[], key: string) => String(lines.find((l) => l.key === key)?.amount);

describe("financial statements (PGC)", () => {
  // Capital 1 000 000 in cash; bought stock 300 000 on credit (IVA 42 000); sold half for 228 000 cash (IVA 28 000).
  const balances = [
    b("51.1", -1_000_000),
    b("45.1.1", 1_000_000 + 228_000),
    b("26.1", 300_000 - 150_000),
    b("34.5.2.1", 42_000),
    b("32.1.2.1.0001", -342_000),
    b("61.3.1", -200_000),
    b("34.5.3.1", -28_000),
    b("71.2", 150_000),
    b("18.1.5", -10_000),
    b("11.5", 60_000),
    b("45.1.1", -60_000),
    b("73.1", 10_000),
  ];

  it("the balance sheet balances, with the year's result before the apuramento", () => {
    const s = balanceSheet(balances);
    expect(s.totalAssets.toFixed(2)).toBe(s.totalEquityAndLiabilities.toFixed(2));
    expect(amount(s.lines, "netResult")).toBe("40000");
    expect(amount(s.lines, "tangibleAssets")).toBe("50000"); // 60 000 less 10 000 depreciated
    expect(amount(s.lines, "inventories")).toBe("150000");
    expect(amount(s.lines, "cashAndBanks")).toBe("1168000");
    expect(amount(s.lines, "otherReceivables")).toBe("42000"); // IVA dedutível (debit balance in 34)
    expect(amount(s.lines, "stateLiabilities")).toBe("28000");
    expect(amount(s.lines, "tradePayables")).toBe("342000");
  });

  it("the income statement by nature: sales less costs, operating result, net result", () => {
    const s = incomeStatement(balances);
    expect(amount(s.lines, "sales")).toBe("200000");
    expect(amount(s.lines, "costOfGoodsSold")).toBe("-150000");
    expect(amount(s.lines, "depreciation")).toBe("-10000");
    expect(amount(s.lines, "operatingResult")).toBe("40000");
    expect(s.netResult.toString()).toBe("40000");
  });

  it("after the apuramento (classes 6/7 moved to 82, then to 88) the balance sheet shows the same result", () => {
    const after = [...balances.filter((x) => !/^(61|71|73)\./.test(x.code)), b("88.1", -40_000)];
    const s = balanceSheet(after);
    expect(amount(s.lines, "netResult")).toBe("40000");
    expect(s.totalAssets.toFixed(2)).toBe(s.totalEquityAndLiabilities.toFixed(2));
  });

  it("ages open documents by days since their date", () => {
    expect(ageBucket("2026-10-17", "2026-10-17")).toBe("d0_30");
    expect(ageBucket("2026-09-17", "2026-10-17")).toBe("d0_30");
    expect(ageBucket("2026-09-16", "2026-10-17")).toBe("d31_60");
    expect(ageBucket("2026-07-01", "2026-10-17")).toBe("d91");
  });
});
