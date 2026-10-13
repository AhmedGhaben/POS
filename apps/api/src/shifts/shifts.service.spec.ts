import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { checkDenominations, computeExpectedCash, isFlagged } from "./shifts.service";

const D = (n: number | string) => new Prisma.Decimal(n);

describe("expected cash at close", () => {
  it("is float + cash sales − cash refunds + cash in − cash out", () => {
    const expected = computeExpectedCash({
      openingFloat: D(10000),
      cashSales: D(24500),
      cashRefunds: D(1500),
      cashIn: D(5000),
      cashOut: D(20000),
    });
    expect(expected.toFixed(2)).toBe("18000.00");
  });

  it("is just the float with nothing else", () => {
    expect(computeExpectedCash({ openingFloat: D(5000), cashSales: D(0), cashRefunds: D(0), cashIn: D(0), cashOut: D(0) }).toFixed(2)).toBe(
      "5000.00",
    );
  });

  it("keeps cents exact", () => {
    expect(
      computeExpectedCash({ openingFloat: D("0.10"), cashSales: D("0.20"), cashRefunds: D(0), cashIn: D(0), cashOut: D(0) }).toFixed(2),
    ).toBe("0.30");
  });
});

describe("blind count by note and coin", () => {
  it("accepts a count that adds up, dropping zeros", () => {
    expect(checkDenominations(D(16300), { "5000": 3, "1000": 1, "200": 1, "100": 1, "50": 0 })).toEqual({
      "5000": 3,
      "1000": 1,
      "200": 1,
      "100": 1,
    });
  });

  it("refuses a count that doesn't add up to the counted cash", () => {
    expect(() => checkDenominations(D(16000), { "5000": 3 })).toThrow(BadRequestException);
  });

  it("refuses negative or fractional counts and bad values", () => {
    expect(() => checkDenominations(D(0), { "5000": -1 })).toThrow(BadRequestException);
    expect(() => checkDenominations(D(2500), { "5000": 0.5 })).toThrow(BadRequestException);
    expect(() => checkDenominations(D(0), { abc: 1 })).toThrow(BadRequestException);
  });

  it("is optional", () => {
    expect(checkDenominations(D(123), undefined)).toBeNull();
  });
});

describe("flagging differences", () => {
  it("flags a difference over the threshold either way", () => {
    expect(isFlagged(D(-1500), D(1000))).toBe(true);
    expect(isFlagged(D(1500), D(1000))).toBe(true);
  });

  it("doesn't flag at or under the threshold, or without one", () => {
    expect(isFlagged(D(1000), D(1000))).toBe(false);
    expect(isFlagged(D(-200), D(1000))).toBe(false);
    expect(isFlagged(D(99999), null)).toBe(false);
  });
});
