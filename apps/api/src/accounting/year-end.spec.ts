import { D } from "./entry-rules";
import { carriedForward, closesIntoNetResult, resultAccountFor, zeroingLines } from "./year-end";

describe("year-end rules", () => {
  it("income and costs close into the result of their nature (PGC)", () => {
    expect(resultAccountFor("61.3.1")).toBe("82.1");
    expect(resultAccountFor("75.2.1")).toBe("82.1");
    expect(resultAccountFor("66.1")).toBe("83.1");
    expect(resultAccountFor("76.8")).toBe("83.1");
    expect(resultAccountFor("67.1")).toBe("84.1");
    expect(resultAccountFor("68.8.1")).toBe("85.1");
    expect(resultAccountFor("78.3.1")).toBe("85.1");
    expect(resultAccountFor("79.1")).toBe("86.1");
    expect(resultAccountFor("45.1.1")).toBeNull();
    expect(resultAccountFor("88.1")).toBeNull();
  });

  it("82-87 close into 88; classes 1-5 and 8 are carried into the next year", () => {
    expect(["82.1", "86.1", "87.1"].every(closesIntoNetResult)).toBe(true);
    expect(closesIntoNetResult("88.1")).toBe(false);
    expect(closesIntoNetResult("81.1")).toBe(false);
    expect(["11.5", "26.1", "31.1.2.1.0001", "45.1.1", "51.1", "81.1", "88.1"].every(carriedForward)).toBe(true);
    expect(["61.3.1", "71.2"].some(carriedForward)).toBe(false);
  });

  it("zeroing lines bring every balance to nought; the net goes to the counterpart", () => {
    const { lines, net } = zeroingLines([
      { accountId: "sales", balance: D(-1000) },
      { accountId: "cogs", balance: D(600) },
      { accountId: "none", balance: D(0) },
    ]);
    expect(lines).toEqual([
      { accountId: "sales", debit: D(1000) },
      { accountId: "cogs", credit: D(600) },
    ]);
    expect(net.toString()).toBe("-400"); // a profit: credited to the result account
  });
});
