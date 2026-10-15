import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { allocateOldestFirst, availableCredit, checkAllocations, openAmount, paymentStatus, type OpenItem } from "./account-math";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const show = (a: { id: string; amount: Prisma.Decimal }[]) => a.map((x) => [x.id, x.amount.toFixed(2)]);

describe("customer and supplier accounts", () => {
  const items: OpenItem[] = [
    { id: "ft3", sortKey: "2026-10-12|0003", open: D(300) },
    { id: "ft1", sortKey: "2026-10-01|0001", open: D(100) },
    { id: "ft2", sortKey: "2026-10-05|0002", open: D("50.50") },
  ];

  it("what's still owed: total less paid and credited, never negative", () => {
    expect(openAmount(D(100), D(30), D(20)).toFixed(2)).toBe("50.00");
    expect(openAmount(D(100), D(80), D(30)).toFixed(2)).toBe("0.00");
  });

  it("a payment goes to the oldest invoices first", () => {
    expect(show(allocateOldestFirst(items, D(120)))).toEqual([
      ["ft1", "100.00"],
      ["ft2", "20.00"],
    ]);
    expect(show(allocateOldestFirst(items, D("450.50")))).toEqual([
      ["ft1", "100.00"],
      ["ft2", "50.50"],
      ["ft3", "300.00"],
    ]);
  });

  it("can't pay more than is owed (no money on account yet)", () => {
    expect(() => allocateOldestFirst(items, D("450.51"))).toThrow("The payment is more than what is owed");
  });

  it("chosen allocations must fit each document and add up to the payment", () => {
    expect(show(checkAllocations(items, [{ id: "ft3", amount: D(200) }], D(200)))).toEqual([["ft3", "200.00"]]);
    expect(() => checkAllocations(items, [{ id: "ft2", amount: D(51) }], D(51))).toThrow("more than what is still owed");
    expect(() => checkAllocations(items, [{ id: "ft1", amount: D(50) }], D(60))).toThrow("add up to the payment");
    expect(() => checkAllocations(items, [{ id: "other", amount: D(10) }], D(10))).toThrow(BadRequestException);
    expect(() => checkAllocations(items, [{ id: "ft1", amount: D(10) }, { id: "ft1", amount: D(10) }], D(20))).toThrow(BadRequestException);
  });

  it("a purchase is unpaid, partly paid or paid", () => {
    expect(paymentStatus(D(100), D(0))).toBe("UNPAID");
    expect(paymentStatus(D(100), D("99.99"))).toBe("PARTIAL");
    expect(paymentStatus(D(100), D(100))).toBe("PAID");
    expect(paymentStatus(D(0), D(0))).toBe("PAID");
  });

  it("credit left: limit less balance; none without a limit", () => {
    expect(availableCredit(D(500), D(120))!.toFixed(2)).toBe("380.00");
    expect(availableCredit(D(500), D(600))!.toFixed(2)).toBe("0.00");
    expect(availableCredit(null, D(0))).toBeNull();
  });
});
