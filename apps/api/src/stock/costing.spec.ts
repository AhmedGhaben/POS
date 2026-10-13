import { applyMovement } from "./costing";

const plain = (r: ReturnType<typeof applyMovement>) => ({
  quantity: r.quantity.toNumber(),
  averageCost: r.averageCost.toNumber(),
  unitCost: r.unitCost.toNumber(),
});

describe("weighted average cost", () => {
  it("a purchase re-averages the cost", () => {
    // 10 at 100 + 30 at 140 = 40 at 130
    expect(plain(applyMovement({ quantity: 10, averageCost: 100 }, 30, 140, 90))).toEqual({ quantity: 40, averageCost: 130, unitCost: 140 });
  });

  it("works with decimal quantities and keeps 4 decimals", () => {
    // 2.5 kg at 1000 + 1.25 kg at 1300 = 3.75 kg at 1100
    expect(plain(applyMovement({ quantity: "2.5", averageCost: 1000 }, "1.25", 1300, 0))).toEqual({ quantity: 3.75, averageCost: 1100, unitCost: 1300 });
    // 3 at 10 + 1 at 11 = 10.25; 3 at 10 + 2 at 11.11 = 10.444
    expect(applyMovement({ quantity: 3, averageCost: 10 }, 2, "11.11", 0).averageCost.toString()).toBe("10.444");
    expect(applyMovement({ quantity: 1, averageCost: 1 }, 2, 2, 0).averageCost.toString()).toBe("1.6667");
  });

  it("a sale leaves at the average and doesn't change it", () => {
    expect(plain(applyMovement({ quantity: 40, averageCost: 130 }, -3, null, 90))).toEqual({ quantity: 37, averageCost: 130, unitCost: 130 });
  });

  it("returns and cancelled sales come back at the average", () => {
    expect(plain(applyMovement({ quantity: 37, averageCost: 130 }, 3, null, 90))).toEqual({ quantity: 40, averageCost: 130, unitCost: 130 });
  });

  it("with no stock, or less than none, the average restarts at the new cost", () => {
    expect(plain(applyMovement({ quantity: 0, averageCost: 130 }, 5, 150, 90))).toEqual({ quantity: 5, averageCost: 150, unitCost: 150 });
    // Sold offline below zero: the next purchase sets the cost.
    expect(plain(applyMovement({ quantity: -2, averageCost: 130 }, 10, 150, 90))).toEqual({ quantity: 8, averageCost: 150, unitCost: 150 });
  });

  it("stock without an average yet is valued at the product's cost price", () => {
    expect(plain(applyMovement({ quantity: 0, averageCost: 0 }, -1, null, 90))).toEqual({ quantity: -1, averageCost: 90, unitCost: 90 });
    expect(plain(applyMovement({ quantity: 0, averageCost: 0 }, 4, null, 90))).toEqual({ quantity: 4, averageCost: 90, unitCost: 90 });
  });
});
