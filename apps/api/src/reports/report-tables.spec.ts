import { marginPercent, money, paymentsByMethod, quantity, sumColumns, turnoverReceived } from "./report-tables";

describe("report tables", () => {
  it("money and quantities as exact strings; margin % one decimal, none without sales", () => {
    expect(money("12.345")).toBe("12.35");
    expect(money(null)).toBe("0.00");
    expect(quantity("2.5000")).toBe("2.5");
    expect(marginPercent("200", "50")).toBe(25);
    expect(marginPercent("300", "100")).toBe(33.3);
    expect(marginPercent(0, 0)).toBeNull();
    expect(marginPercent("100", "-20")).toBe(-20);
  });

  it("sums columns exactly (no float drift)", () => {
    const rows = Array.from({ length: 10 }, () => ({ net: "0.10", documents: 1 }));
    expect(sumColumns(rows, ["net"])).toEqual({ net: "1.00" });
    expect(sumColumns(rows, ["documents"], "count")).toEqual({ documents: 10 });
  });

  it("money by method: FR and RC received, NC refunded; the Simplificado turnover is what's left", () => {
    const entries = [
      { documentType: "FR", storeId: "a", payments: [{ method: "CASH", amount: "100" }, { method: "CARD", amount: "50.50" }] },
      { documentType: "RC", storeId: "a", payments: [{ method: "BANK_TRANSFER", amount: 200 }] },
      { documentType: "NC", storeId: "a", payments: [{ method: "CASH", amount: "30" }] },
      // A credit note that only credited the customer's account: no money.
      { documentType: "NC", storeId: "a", payments: null },
    ];
    const byMethod = paymentsByMethod(entries);
    expect(Object.fromEntries([...byMethod].map(([m, v]) => [m, [v.received.toFixed(2), v.refunded.toFixed(2)]]))).toEqual({
      CASH: ["100.00", "30.00"],
      CARD: ["50.50", "0.00"],
      BANK_TRANSFER: ["200.00", "0.00"],
    });
    expect(turnoverReceived(entries).toFixed(2)).toBe("320.50");
  });
});
