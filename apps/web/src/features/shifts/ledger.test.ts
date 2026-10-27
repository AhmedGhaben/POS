import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@pos/shared";
import { isEmptyShift, isEmptySummary, localSummary, type LocalShift } from "./ledger";

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
  it("lists each sale by its fiscal number, with the internal receipt number kept (tester #26)", () => {
    const s = localSummary(
      shift({
        sales: [
          { key: "a", total: 10, discount: 0, cashierId: "u1", cashier: "Ana", payments: [{ method: PaymentMethod.CASH, amount: 10 }], voided: false, receiptNumber: "OFF-MAIN-0a1b2c3d4e5f", documentNo: "FR POS001-2026/57", at: "2026-10-11T09:00:00Z" },
          { key: "b", total: 5, discount: 0, cashierId: "u1", cashier: "Ana", payments: [{ method: PaymentMethod.CASH, amount: 5 }], voided: false, receiptNumber: "MAIN-1792930259132", at: "2026-10-11T09:05:00Z" },
        ],
      }),
    );
    expect(s.sales).toMatchObject([
      { receiptNumber: "OFF-MAIN-0a1b2c3d4e5f", documentNo: "FR POS001-2026/57" },
      { receiptNumber: "MAIN-1792930259132", documentNo: null },
    ]);
  });

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

  it("credit: what went on account isn't cash; customers' cash payments are (annulled ones aren't)", () => {
    const s = localSummary(
      shift({
        sales: [
          { key: "a", total: 100, discount: 0, cashierId: "u1", cashier: "Ana", payments: [], voided: false, credit: 100 },
          { key: "b", total: 60, discount: 0, cashierId: "u1", cashier: "Ana", payments: [{ method: PaymentMethod.CASH, amount: 20 }], voided: false, credit: 40 },
        ],
        receipts: [
          { id: "r1", method: PaymentMethod.CASH, amount: 30 },
          { id: "r2", method: PaymentMethod.BANK_TRANSFER, amount: 50 },
          { id: "r3", method: PaymentMethod.CASH, amount: 999, voided: true },
        ],
      }),
    );
    // 100 + 20 (the second sale's deposit) + 30 (a receipt in cash)
    expect(s.expectedCash).toBe("150.00");
    expect(s.onCredit).toBe("140.00");
    expect(s.receipts).toEqual({ count: 2, total: "80.00", byMethod: { CASH: "30.00", BANK_TRANSFER: "50.00" } });
    expect(s.sales!.map((x) => x.method)).toEqual(["CREDIT", "SPLIT"]);
  });

  it("an empty shift expects just the float", () => {
    expect(localSummary(shift({ openingFloat: 75.5 })).expectedCash).toBe("75.50");
  });
});

describe("an empty shift (closes in one click with the float as the count)", () => {
  const sale = { key: "a", total: 10, discount: 0, cashierId: "u1", cashier: "Ana", payments: [{ method: PaymentMethod.CASH, amount: 10 }], voided: false };
  it("no sale, no cash in or out, no receipt", () => {
    expect(isEmptyShift(shift())).toBe(true);
    expect(isEmptyShift(shift({ sales: [sale] }))).toBe(false);
    // A cancelled sale still happened.
    expect(isEmptyShift(shift({ sales: [{ ...sale, voided: true }] }))).toBe(false);
    expect(isEmptyShift(shift({ movements: [{ clientId: "m1", type: "OUT", amount: 5, reason: "CASH_PICKUP", note: null, occurredAt: "", user: "Ana" }] }))).toBe(false);
    expect(isEmptyShift(shift({ receipts: [{ id: "r1", method: PaymentMethod.CASH, amount: 3 }] }))).toBe(false);
  });

  it("the server's figures for a shift taken over from another device", () => {
    const summary = {
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
      expectedCash: "100",
    };
    expect(isEmptySummary(summary)).toBe(true);
    expect(isEmptySummary({ ...summary, salesCount: 1 })).toBe(false);
    expect(isEmptySummary({ ...summary, returns: { count: 1, total: "5", cash: "5" } })).toBe(false);
    expect(isEmptySummary({ ...summary, receipts: { count: 1, total: "3", byMethod: {} } })).toBe(false);
  });
});
