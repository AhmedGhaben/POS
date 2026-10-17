import type { CountryConfig, IvaRegime } from "@pos/shared";

/**
 * Export periods as plain calendar dates ("2026-10-31"): what the date
 * inputs give and what the API wants. Never turned into Date objects in the
 * browser's own time zone, which shifted the period by a day before.
 */

/** Today's date on the shop's clock (e.g. Africa/Luanda), whatever the computer's zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "2026-10" → 1 to 31 October. */
export function monthRange(month: string): { startDate: string; endDate: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { startDate: `${month}-01`, endDate: addDays(next, -1) };
}

export interface PeriodValue {
  mode: "month" | "range";
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

/** The period's first and last day, as calendar dates. */
export function periodDates(p: PeriodValue): { startDate: string; endDate: string } {
  return p.mode === "month" ? monthRange(p.month) : { startDate: p.startDate, endDate: p.endDate };
}

/** The month before today's ("2026-09" on any day of October). */
export function previousMonth(today: string): string {
  return addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
}

export function lastYearEnd(today: string): string {
  return `${Number(today.slice(0, 4)) - 1}-12-31`;
}

export interface Deadline {
  key: string;
  /** The day it's due (YYYY-MM-DD). */
  due: string;
  /** What it covers: a month ("2026-09") or a stock date ("2025-12-31"). */
  covers: string;
  overdue: boolean;
}

/**
 * The SAF-T deadlines to remind about today, from the country config:
 * the monthly invoicing file (only while e-invoicing is off) from the 1st
 * of the month until it's due; the yearly inventory file from 1 January
 * until it's due. `daysAfter` keeps showing one that has just passed.
 */
export function upcomingDeadlines(
  today: string,
  config: Pick<CountryConfig, "deadlines"> | null,
  options: { eInvoicingActive: boolean; regimes: IvaRegime[]; accountingEnabled?: boolean; purchasesFile?: "AUTO" | "ALWAYS" | "NEVER" },
  daysAfter = 0,
): Deadline[] {
  if (!config) return [];
  const out: Deadline[] = [];
  for (const d of config.deadlines) {
    if (d.when === "eInvoicingOff" && options.eInvoicingActive) continue;
    if (d.when === "accountingOn" && !options.accountingEnabled) continue;
    if (d.when === "purchasesFile") {
      const rule = options.purchasesFile ?? "AUTO";
      if (rule === "NEVER" || (rule === "AUTO" && options.eInvoicingActive)) continue;
    }
    if (d.regimes && !options.regimes.some((r) => d.regimes!.includes(r))) continue;
    if (d.kind === "monthly") {
      const due = `${today.slice(0, 7)}-${String(d.day).padStart(2, "0")}`;
      if (today <= addDays(due, daysAfter)) out.push({ key: d.key, due, covers: previousMonth(today), overdue: today > due });
    } else {
      const due = `${today.slice(0, 4)}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      if (today <= addDays(due, daysAfter)) out.push({ key: d.key, due, covers: lastYearEnd(today), overdue: today > due });
    }
  }
  return out;
}
