import { describe, expect, it } from "vitest";
import { creditSplit, NO_CREDIT } from "./credit";

describe("selling on credit", () => {
  it("off: everything is paid now", () => {
    expect(creditSplit(120, NO_CREDIT)).toEqual({ paidNow: 120, onAccount: 0 });
  });

  it("on: what isn't paid now goes on the account, to the cent", () => {
    expect(creditSplit(120, { on: true, paidNow: "" })).toEqual({ paidNow: 0, onAccount: 120 });
    expect(creditSplit(120.5, { on: true, paidNow: "20.3" })).toEqual({ paidNow: 20.3, onAccount: 100.2 });
  });

  it("paid now can't be negative or more than the total", () => {
    expect(creditSplit(50, { on: true, paidNow: "-5" })).toEqual({ paidNow: 0, onAccount: 50 });
    expect(creditSplit(50, { on: true, paidNow: "80" })).toEqual({ paidNow: 50, onAccount: 0 });
  });
});
