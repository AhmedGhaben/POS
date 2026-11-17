import { describe, expect, it } from "vitest";
import { DUE_SOON_DAYS, daysUntil, deadlineLevel, deadlineRoute, groupDeadlines } from "./deadline-groups";
import type { Deadline } from "./export-periods";

const d = (key: string, due: string, overdue = false): Deadline => ({ key, due, covers: "2026-10", overdue });

describe("SAF-T reminder levels", () => {
  it("counts calendar days to the due date", () => {
    expect(daysUntil("2026-11-17", "2026-11-30")).toBe(13);
    expect(daysUntil("2026-11-30", "2026-11-30")).toBe(0);
    expect(daysUntil("2026-12-02", "2026-11-30")).toBe(-2);
    expect(daysUntil("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("more than 7 days: later; 7 or fewer: soon; passed: passed", () => {
    expect(DUE_SOON_DAYS).toBe(7);
    expect(deadlineLevel(8)).toBe("later");
    expect(deadlineLevel(7)).toBe("soon");
    expect(deadlineLevel(1)).toBe("soon");
    expect(deadlineLevel(0)).toBe("soon");
    expect(deadlineLevel(-1)).toBe("passed");
  });
});

describe("groupDeadlines", () => {
  it("files due the same day share one notice, in their original order", () => {
    const groups = groupDeadlines([d("saftInvoicing", "2026-11-30"), d("saftPurchases", "2026-11-30")], "2026-11-17");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ due: "2026-11-30", daysLeft: 13, level: "later" });
    expect(groups[0].items.map((i) => i.key)).toEqual(["saftInvoicing", "saftPurchases"]);
  });

  it("different days stay apart, soonest first, passed ones on top", () => {
    const groups = groupDeadlines(
      [d("saftInventory", "2027-02-15"), d("saftInvoicing", "2026-11-25"), d("saftAccounting", "2026-11-14", true)],
      "2026-11-20",
    );
    expect(groups.map((g) => [g.due, g.level])).toEqual([
      ["2026-11-14", "passed"],
      ["2026-11-25", "soon"],
      ["2027-02-15", "later"],
    ]);
  });

  it("nothing due: no notices", () => {
    expect(groupDeadlines([], "2026-11-17")).toEqual([]);
  });

  it("each file keeps its own action route", () => {
    expect(deadlineRoute("saftInvoicing")).toBe("/reports?tab=files");
    expect(deadlineRoute("saftInventory")).toBe("/reports?tab=files");
    expect(deadlineRoute("saftAccounting")).toBe("/accounting?tab=saft");
    expect(deadlineRoute("saftPurchases")).toBe("/accounting?tab=saft");
  });
});
