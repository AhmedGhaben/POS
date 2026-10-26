import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@pos/shared";
import { buildOfflineSale } from "./offline-sale";
import { splitEvenly, splitPayments } from "./split-payment";

const row = (id: number, method: PaymentMethod, amount: string) => ({ id, method, amount });

describe("splitPayments", () => {
  it("treats cash above what's due as tendered and gives change", () => {
    const result = splitPayments([row(1, PaymentMethod.CASH, "2000"), row(2, PaymentMethod.CARD, "500")], 1750);
    expect(result.status).toBe("ok");
    expect(result.changeDue).toBe(750);
    expect(result.payments).toEqual([
      { method: PaymentMethod.CASH, amount: 1250, tendered: 2000 },
      { method: PaymentMethod.CARD, amount: 500 },
    ]);
  });

  it("sends exact amounts without a tendered amount", () => {
    const result = splitPayments([row(1, PaymentMethod.CASH, "1250"), row(2, PaymentMethod.CARD, "500")], 1750);
    expect(result).toMatchObject({ status: "ok", changeDue: 0 });
    expect(result.payments).toEqual([
      { method: PaymentMethod.CASH, amount: 1250 },
      { method: PaymentMethod.CARD, amount: 500 },
    ]);
  });

  it("reports what's still due", () => {
    const result = splitPayments([row(1, PaymentMethod.CASH, "1000"), row(2, PaymentMethod.CARD, "500")], 1750);
    expect(result).toMatchObject({ status: "short", remaining: 250, payments: [] });
  });

  it("refuses non-cash rows above the total", () => {
    expect(splitPayments([row(1, PaymentMethod.CARD, "1000"), row(2, PaymentMethod.BANK_TRANSFER, "800")], 1750).status).toBe("nonCashOver");
    // Cash on top of a total already paid by card is not change either.
    expect(splitPayments([row(1, PaymentMethod.CARD, "1750"), row(2, PaymentMethod.CASH, "100")], 1750).status).toBe("nonCashOver");
  });

  it("merges several cash rows into one cash payment", () => {
    const result = splitPayments(
      [row(1, PaymentMethod.CASH, "1000"), row(2, PaymentMethod.CARD, "500"), row(3, PaymentMethod.CASH, "500")],
      1750,
    );
    expect(result.payments).toEqual([
      { method: PaymentMethod.CASH, amount: 1250, tendered: 1500 },
      { method: PaymentMethod.CARD, amount: 500 },
    ]);
  });

  it("keeps the change through the offline receipt", () => {
    const { payments } = splitPayments([row(1, PaymentMethod.CASH, "2000"), row(2, PaymentMethod.CARD, "500")], 1750);
    const receipt = buildOfflineSale("local-1", { storeId: "store-1", clientId: "client-1", lineItems: [], payments }, []);
    expect(receipt.amountTendered).toBe("2000.00");
    expect(receipt.changeDue).toBe("750.00");
  });
});

describe("splitEvenly", () => {
  let id = 100;
  const newId = () => id++;

  it("shares the total to the cent, the last row taking the remainder", () => {
    const rows = splitEvenly([], 100, 3, newId);
    expect(rows.map((r) => r.amount)).toEqual(["33.33", "33.33", "33.34"]);
    expect(rows.map((r) => r.method)).toEqual([PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.CARD]);
  });

  it("keeps the methods of rows already there and limits payers to 2-6", () => {
    const rows = splitEvenly([row(1, PaymentMethod.BANK_TRANSFER, "0")], 1750, 9, newId);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ id: 1, method: PaymentMethod.BANK_TRANSFER, amount: "291.66" });
    expect(rows[5].amount).toBe("291.70");
    expect(splitEvenly([], 10, 1, newId)).toHaveLength(2);
  });
});
