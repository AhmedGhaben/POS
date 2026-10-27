import { describe, expect, it } from "vitest";
import type { ShiftSummaryDto } from "@pos/shared";
import { cashDifference, notInDrawer } from "./cash-check";

const summary = (extra: Partial<ShiftSummaryDto> = {}): ShiftSummaryDto => ({
  salesCount: 0,
  salesTotal: "0",
  byMethod: {},
  discounts: "0",
  voided: { count: 0, total: "0" },
  returns: { count: 0, total: "0", cash: "0" },
  cashIn: "0",
  cashOut: "0",
  movements: [],
  byCashier: [],
  expectedCash: "0",
  ...extra,
});

describe("closing the till (tester #25)", () => {
  it("the tester's shift: 9,870 sold, 600 of it by Multicaixa, so 9,270 expected; 9,800 counted is 530 over", () => {
    const s = summary({ salesTotal: "9870.00", byMethod: { CASH: "9270.00", CARD: "600.00" }, expectedCash: "9270.00" });
    expect(notInDrawer(s)).toBe(600);
    expect(cashDifference(9800, 9270)).toBe(530);
    expect(cashDifference(9200, 9270)).toBe(-70);
  });

  it("counts account receipts paid other ways too, never cash", () => {
    const s = summary({
      byMethod: { CASH: "100.00", BANK_TRANSFER: "250.10", MOBILE_MONEY: "0.20" },
      receipts: { count: 2, total: "80.00", byMethod: { CASH: "30.00", CARD: "50.00" } },
    });
    expect(notInDrawer(s)).toBe(300.3);
    expect(notInDrawer(summary({ byMethod: { CASH: "100.00" } }))).toBe(0);
  });

  it("works to the cent", () => {
    expect(cashDifference(100.1, 100.3)).toBe(-0.2);
    expect(cashDifference(0.3, 0.1 + 0.2)).toBe(0);
  });
});
