import { describe, expect, it } from "vitest";
import { AO } from "@pos/shared";
import { addDays, lastYearEnd, monthRange, previousMonth, todayIn, upcomingDeadlines } from "./export-periods";

describe("export periods (calendar dates)", () => {
  it("a month runs from the 1st to its last day: month end, year end, leap years", () => {
    expect(monthRange("2026-10")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(monthRange("2026-12")).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31" });
    expect(monthRange("2028-02")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(monthRange("2026-02")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  });

  it("last month and last year end, across the year boundary", () => {
    expect(previousMonth("2026-11-01")).toBe("2026-10");
    expect(previousMonth("2027-01-15")).toBe("2026-12");
    expect(lastYearEnd("2027-01-01")).toBe("2026-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("today is the shop's date, not the computer's: 00:30 on 1 November in Luanda is still 31 October in UTC", () => {
    const at = new Date("2026-10-31T23:30:00Z");
    expect(todayIn("Africa/Luanda", at)).toBe("2026-11-01");
    expect(todayIn("UTC", at)).toBe("2026-10-31");
    expect(todayIn("Africa/Luanda", new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("SAF-T deadline reminders (Angola)", () => {
  const off = { eInvoicingActive: false, regimes: ["GERAL" as const] };

  it("the monthly files for last month, due by the last day of this month (Decreto 312/18, art. 3)", () => {
    // The purchases file (Aquisição) is reminded like the invoicing file unless the accounting setting says otherwise.
    expect(upcomingDeadlines("2026-10-03", AO, off)).toEqual([
      { key: "saftInvoicing", due: "2026-10-31", covers: "2026-09", overdue: false },
      { key: "saftPurchases", due: "2026-10-31", covers: "2026-09", overdue: false },
    ]);
    expect(upcomingDeadlines("2026-10-31", AO, off)).toHaveLength(2);
    // The month's own last day: 30 November, 28 February, 29 February in a leap year.
    expect(upcomingDeadlines("2026-11-30", AO, off)[0]).toMatchObject({ due: "2026-11-30", covers: "2026-10", overdue: false });
    expect(upcomingDeadlines("2027-02-10", AO, off)[0]).toMatchObject({ due: "2027-02-28" });
    expect(upcomingDeadlines("2028-02-10", AO, off)[0]).toMatchObject({ due: "2028-02-29" });
    // On the 1st, the next month's file takes over: never two reminders for one file.
    expect(upcomingDeadlines("2026-11-01", AO, off, 5).map((d) => [d.key, d.covers])).toEqual([
      ["saftInvoicing", "2026-10"],
      ["saftPurchases", "2026-10"],
    ]);
  });

  it("the business can set its own due day for the purchases file; a day past the month's end is its last day", () => {
    const own = { ...off, purchasesFileDueDay: 15 };
    expect(upcomingDeadlines("2026-10-03", AO, own)).toEqual([
      { key: "saftInvoicing", due: "2026-10-31", covers: "2026-09", overdue: false },
      { key: "saftPurchases", due: "2026-10-15", covers: "2026-09", overdue: false },
    ]);
    expect(upcomingDeadlines("2026-10-16", AO, own).map((d) => d.key)).toEqual(["saftInvoicing"]);
    expect(upcomingDeadlines("2026-10-17", AO, own, 3)[1]).toMatchObject({ key: "saftPurchases", overdue: true });
    expect(upcomingDeadlines("2026-11-03", AO, { ...off, purchasesFileDueDay: 31 })[1]).toMatchObject({ due: "2026-11-30" });
    expect(upcomingDeadlines("2026-10-03", AO, { ...off, purchasesFileDueDay: null })[1]).toMatchObject({ due: "2026-10-31" });
  });

  it("none once e-invoicing is live", () => {
    expect(upcomingDeadlines("2026-10-03", AO, { ...off, eInvoicingActive: true })).toEqual([]);
  });

  it("in January and early February: last December's inventory too", () => {
    expect(upcomingDeadlines("2027-01-10", AO, off)).toEqual([
      { key: "saftInvoicing", due: "2027-01-31", covers: "2026-12", overdue: false },
      { key: "saftInventory", due: "2027-02-15", covers: "2026-12-31", overdue: false },
      { key: "saftPurchases", due: "2027-01-31", covers: "2026-12", overdue: false },
    ]);
    // After 15 February the inventory file is past; January's monthly files are still due.
    expect(upcomingDeadlines("2027-02-20", AO, off).map((d) => d.key)).toEqual(["saftInvoicing", "saftPurchases"]);
    expect(upcomingDeadlines("2027-01-10", AO, { ...off, regimes: ["EXCLUSAO"] }).map((d) => d.key)).toEqual(["saftInvoicing", "saftPurchases"]);
  });

  it("the accounting file for last year by 10 April, when the books are kept in the app", () => {
    expect(upcomingDeadlines("2027-03-20", AO, { ...off, eInvoicingActive: true })).toEqual([]);
    expect(upcomingDeadlines("2027-03-20", AO, { ...off, eInvoicingActive: true, accountingEnabled: true })).toEqual([
      { key: "saftAccounting", due: "2027-04-10", covers: "2026-12-31", overdue: false },
    ]);
    expect(upcomingDeadlines("2027-04-11", AO, { ...off, eInvoicingActive: true, accountingEnabled: true })).toEqual([]);
  });

  it("the purchases file follows its setting: always, never, or while e-invoicing is off", () => {
    const keys = (o: Partial<Parameters<typeof upcomingDeadlines>[2]>) => upcomingDeadlines("2026-10-03", AO, { ...off, ...o }).map((d) => d.key);
    expect(keys({ purchasesFile: "NEVER" })).toEqual(["saftInvoicing"]);
    expect(keys({ eInvoicingActive: true, purchasesFile: "ALWAYS" })).toEqual(["saftPurchases"]);
    expect(keys({ eInvoicingActive: true, purchasesFile: "AUTO" })).toEqual([]);
  });
});
