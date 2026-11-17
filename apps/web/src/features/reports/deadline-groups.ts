import type { Deadline } from "./export-periods";

/**
 * How the dashboard shows SAF-T reminders. Display only: which files are due
 * and when comes from upcomingDeadlines (export-periods.ts), unchanged.
 *
 * - "later": more than DUE_SOON_DAYS left, a quiet neutral notice;
 * - "soon": DUE_SOON_DAYS or fewer, a stronger neutral notice (amber means
 *   "offline but still selling" only);
 * - "passed": the deadline has passed, in the error colour. The app doesn't
 *   know whether the file was submitted to AGT, so it never says it wasn't.
 */
export const DUE_SOON_DAYS = 7;

export type DeadlineLevel = "later" | "soon" | "passed";

export interface DeadlineGroup {
  /** YYYY-MM-DD, shared by every file in the group. */
  due: string;
  /** Calendar days from today to the due date (0 = today, negative = passed). */
  daysLeft: number;
  level: DeadlineLevel;
  items: Deadline[];
}

/** Calendar days between two YYYY-MM-DD dates (the shop's dates, no clock involved). */
export function daysUntil(today: string, due: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function deadlineLevel(daysLeft: number): DeadlineLevel {
  if (daysLeft < 0) return "passed";
  return daysLeft <= DUE_SOON_DAYS ? "soon" : "later";
}

/** Files due the same day become one notice; soonest (and passed) first. */
export function groupDeadlines(deadlines: Deadline[], today: string): DeadlineGroup[] {
  const byDue = new Map<string, Deadline[]>();
  for (const d of deadlines) byDue.set(d.due, [...(byDue.get(d.due) ?? []), d]);
  return [...byDue.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([due, items]) => {
      const daysLeft = daysUntil(today, due);
      return { due, daysLeft, level: deadlineLevel(daysLeft), items };
    });
}

/** Where each file is made (the same routes as before). */
export function deadlineRoute(key: string): string {
  return key === "saftAccounting" || key === "saftPurchases" ? "/accounting?tab=saft" : "/reports?tab=files";
}
