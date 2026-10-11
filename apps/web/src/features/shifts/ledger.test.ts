import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@pos/shared";
import { localSummary, type LocalShift } from "./ledger";

const shift = (extra: Partial<LocalShift> = {}): LocalShift => ({
  clientId: "s1",
  storeId: "store",
  terminalId: "t1",
  openedAt: "2026-10-11T08:00:00Z",
  openingFloat: 100,
  openedBy: { id: "u1", name: "Ana" },
  sales: [],
  movements: [],
  ...extra,
});

describe("localSummary", () => {
  it("expected cash = float + cash taken + cash in - cash out, without cancelled sales", () => {
    const s = localSummary(
      shift({
        sales: [
          { key: "a", total: 10, discount: 0, cashierId: "u1", cashier: "Ana", payments: [{ method: PaymentMethod.CASH, amount: 10 }], voided: false },
          { key: "b", total: 8, discount: 2, cashierId: "u2", cashier: "Bruno", payments: [{ method: PaymentMethod.CASH, amount: 8 }], voided: false },
          { key: "c", total: 10, discount: 0, cashierId: "u1", cashier: "Ana", payments: [{ method: PaymentMethod.CASH, amount: 10 }], voided: true },
          {
            key: "d",
            total: 20,
            discount: 0,
            cashierId: "u1",
            cashier: "Ana",
            payments: [
              { method: PaymentMethod.CASH, amount: 5.5 },
              { method: PaymentMethod.CARD, amount: 14.5 },
            ],
            voided: false,
          },
        ],
        movements: [
          { clientId: "m1", type: "IN", amount: 50, reason: "CHANGE_TOPUP", note: null, occurredAt: "", user: "Ana" },
          { clientId: "m2", type: "OUT", amount: 30.25, reason: "CASH_PICKUP", note: null, occurredAt: "", user: "Ana" },
        ],
      }),
    );
    // 100 + (10 + 8 + 5.50) + 50 - 30.25
    expect(s.expectedCash).toBe("143.25");
    expect(s).toMatchObject({
      salesCount: 3,
      salesTotal: "38.00",
      byMethod: { CASH: "23.50", CARD: "14.50" },
      discounts: "2.00",
      voided: { count: 1, total: "10.00" },
      cashIn: "50.00",
      cashOut: "30.25",
    });
    expect(s.byCashier).toEqual([
      { id: "u1", name: "Ana", count: 2, total: "30.00" },
      { id: "u2", name: "Bruno", count: 1, total: "8.00" },
    ]);
  });

  it("an empty shift expects just the float", () => {
    expect(localSummary(shift({ openingFloat: 75.5 })).expectedCash).toBe("75.50");
  });
});
