import { D } from "./entry-rules";
import { ASSET_CATEGORIES, depreciationStart, monthlyDepreciation } from "./fixed-assets";

describe("fixed assets", () => {
  const computer = { acquisitionValue: D(1_200_000), residualValue: D(0), annualRate: D(25), depreciationStart: "2027-01-01" };

  it("depreciates from the month it was bought (duodécimos)", () => {
    expect(depreciationStart("2027-01-15")).toBe("2027-01-01");
    expect(monthlyDepreciation(computer, 2026, 12, D(0)).toString()).toBe("0");
    expect(monthlyDepreciation(computer, 2027, 1, D(0)).toString()).toBe("25000");
  });

  it("straight line on the value less residual, never past it; cents rounded", () => {
    const van = { acquisitionValue: D(1000), residualValue: D(100), annualRate: D(20), depreciationStart: "2027-01-01" };
    expect(monthlyDepreciation(van, 2027, 6, D(0)).toString()).toBe("15"); // 900 × 20% / 12
    expect(monthlyDepreciation(van, 2031, 12, D(890)).toString()).toBe("10"); // only what's left
    expect(monthlyDepreciation(van, 2032, 1, D(900)).toString()).toBe("0");
    expect(monthlyDepreciation({ ...van, acquisitionValue: D(1000), residualValue: D(0), annualRate: D(33.33) }, 2027, 1, D(0)).toString()).toBe("27.78");
  });

  it("every group posts to PGC accounts of classes 1 and 7 with a rate", () => {
    for (const c of Object.values(ASSET_CATEGORIES)) {
      expect(c.asset).toMatch(/^1[12]\./);
      expect(c.accumulated).toMatch(/^18\./);
      expect(c.expense).toMatch(/^73\./);
      expect(c.maxRate).toBeGreaterThan(0);
    }
  });
});
