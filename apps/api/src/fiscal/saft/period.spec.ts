import { BadRequestException } from "@nestjs/common";
import { addDays, exportPeriod, lastYearEnd, localDate, parseCalendarDate, previousMonth, startOfLocalDay } from "./period";

const LUANDA = "Africa/Luanda"; // UTC+1 all year

describe("SAF-T export periods: calendar dates in the store's time zone", () => {
  describe("month end: 2026-10-01 to 2026-10-31", () => {
    const p = exportPeriod("2026-10-01", "2026-10-31", LUANDA, { sameYear: true });

    it("keeps the dates as given", () => {
      expect(p).toMatchObject({ startDate: "2026-10-01", endDate: "2026-10-31", fiscalYear: 2026 });
    });

    it("runs from midnight on 1 October to midnight on 1 November, Luanda time", () => {
      expect(p.from.toISOString()).toBe("2026-09-30T23:00:00.000Z");
      expect(p.until.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    });

    it("includes the last minutes of 31 October and excludes the first of 1 November there", () => {
      const inside = (iso: string) => new Date(iso) >= p.from && new Date(iso) < p.until;
      expect(inside("2026-10-31T22:30:00Z")).toBe(true); // 23:30 on the 31st in Luanda
      expect(localDate(new Date("2026-10-31T22:30:00Z"), LUANDA)).toBe("2026-10-31");
      expect(inside("2026-10-31T23:30:00Z")).toBe(false); // 00:30 on 1 Nov in Luanda (still the 31st in UTC)
      expect(localDate(new Date("2026-10-31T23:30:00Z"), LUANDA)).toBe("2026-11-01");
      expect(inside("2026-09-30T23:30:00Z")).toBe(true); // 00:30 on 1 Oct in Luanda (still September in UTC)
      expect(inside("2026-09-30T22:59:59Z")).toBe(false); // 23:59:59 on 30 Sep in Luanda
    });
  });

  describe("year end: 2026-01-01 to 2026-12-31", () => {
    const p = exportPeriod("2026-01-01", "2026-12-31", LUANDA, { sameYear: true });

    it("ends on 31 December, fiscal year 2026, and stops at midnight on 1 January 2027 there", () => {
      expect(p).toMatchObject({ startDate: "2026-01-01", endDate: "2026-12-31", fiscalYear: 2026 });
      expect(p.from.toISOString()).toBe("2025-12-31T23:00:00.000Z");
      expect(p.until.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    });

    it("counts 23:30 on New Year's Eve in Luanda and not 00:30 on New Year's Day", () => {
      const inside = (iso: string) => new Date(iso) >= p.from && new Date(iso) < p.until;
      expect(inside("2026-12-31T22:30:00Z")).toBe(true);
      expect(inside("2026-12-31T23:30:00Z")).toBe(false);
      expect(localDate(new Date("2026-12-31T23:30:00Z"), LUANDA)).toBe("2027-01-01");
    });

    it("refuses a period across two fiscal years", () => {
      expect(() => exportPeriod("2026-12-01", "2027-01-31", LUANDA, { sameYear: true })).toThrow(BadRequestException);
      expect(exportPeriod("2026-12-01", "2027-01-31", LUANDA).endDate).toBe("2027-01-31");
    });
  });

  it("gives the same answer whatever time zone the server itself runs in", () => {
    const original = process.env.TZ;
    const results: string[] = [];
    try {
      for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati", "Africa/Luanda"]) {
        process.env.TZ = tz;
        const p = exportPeriod("2026-10-01", "2026-10-31", LUANDA);
        results.push(`${p.startDate} ${p.endDate} ${p.from.toISOString()} ${p.until.toISOString()}`);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
    expect(new Set(results)).toEqual(new Set(["2026-10-01 2026-10-31 2026-09-30T23:00:00.000Z 2026-10-31T23:00:00.000Z"]));
  });

  it("accepts only real YYYY-MM-DD dates", () => {
    expect(parseCalendarDate("2028-02-29")).toBe("2028-02-29");
    for (const bad of ["2026-02-29", "2026-13-01", "2026-10-32", "2026-10-31T00:00:00.000Z", "31/10/2026", "2026-1-5", "", undefined, 20261031]) {
      expect(() => parseCalendarDate(bad)).toThrow(BadRequestException);
    }
  });

  it("refuses an end before the start", () => {
    expect(() => exportPeriod("2026-10-31", "2026-10-01", LUANDA)).toThrow("The start date is after the end date");
  });

  it("works in zones with summer time too (midnight on the day the clocks change)", () => {
    // Lisbon moves to UTC+1 at 01:00 UTC on 29 March 2026; midnight that day is still UTC+0.
    expect(startOfLocalDay("2026-03-29", "Europe/Lisbon").toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(startOfLocalDay("2026-03-30", "Europe/Lisbon").toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });

  it("adds days across month and year ends, leap years included", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("defaults: last month and last year end, by the shop's clock", () => {
    // 00:30 on 1 November in Luanda is still 31 October in UTC: last month is October.
    expect(previousMonth(new Date("2026-10-31T23:30:00Z"), LUANDA)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(previousMonth(new Date("2027-01-15T12:00:00Z"), LUANDA)).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31" });
    expect(previousMonth(new Date("2028-03-10T12:00:00Z"), LUANDA)).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(lastYearEnd(new Date("2026-12-31T23:30:00Z"), LUANDA)).toBe("2026-12-31");
    expect(lastYearEnd(new Date("2026-12-31T22:30:00Z"), LUANDA)).toBe("2025-12-31");
  });
});
