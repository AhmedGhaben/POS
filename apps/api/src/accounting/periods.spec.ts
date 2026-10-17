import { dateFitsPeriod, monthPeriod, periodDates } from "./periods";

describe("accounting periods", () => {
  it("months run from the 1st to their last day, leap years included", () => {
    expect(periodDates(2026, 2)).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(periodDates(2028, 2)).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(periodDates(2026, 12)).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31" });
  });

  it("the opening is 1 January; the year-end periods are 31 December", () => {
    expect(periodDates(2026, 0)).toEqual({ startDate: "2026-01-01", endDate: "2026-01-01" });
    for (const n of [13, 14, 15]) expect(periodDates(2026, n)).toEqual({ startDate: "2026-12-31", endDate: "2026-12-31" });
  });

  it("a date belongs to its month; 13-15 take only 31 December of that year", () => {
    expect(monthPeriod("2026-10-17")).toEqual({ year: 2026, number: 10 });
    expect(dateFitsPeriod("2026-10-17", 2026, 10)).toBe(true);
    expect(dateFitsPeriod("2026-10-17", 2026, 11)).toBe(false);
    expect(dateFitsPeriod("2026-12-31", 2026, 14)).toBe(true);
    expect(dateFitsPeriod("2026-12-30", 2026, 14)).toBe(false);
    expect(dateFitsPeriod("2027-12-31", 2026, 14)).toBe(false);
  });
});
