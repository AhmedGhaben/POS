import { BadRequestException } from "@nestjs/common";
import { localDateTime } from "../fiscal-format";

/**
 * Export periods are plain calendar dates ("2026-10-31"), read in the
 * store's time zone (Angola: Africa/Luanda). Nothing here uses the server's
 * own clock settings: 2026-10-01..2026-10-31 is October in Luanda whether
 * the server runs on UTC or anywhere else.
 */

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A "YYYY-MM-DD" date that exists (no time, no zone); anything else is a 400. */
export function parseCalendarDate(value: unknown): string {
  const match = typeof value === "string" ? CALENDAR_DATE.exec(value) : null;
  if (!match) throw new BadRequestException("Dates must be calendar dates in the form YYYY-MM-DD");
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new BadRequestException("Dates must be calendar dates in the form YYYY-MM-DD");
  }
  return value as string;
}

/** The calendar date `days` after (or before) `date`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** How far the zone's clock is ahead of UTC at that instant, in ms. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const seconds = Math.floor(at.getTime() / 1000) * 1000;
  return Date.parse(`${localDateTime(new Date(seconds), timeZone).dateTime}Z`) - seconds;
}

/** The instant a calendar day begins in a time zone (midnight there). */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  // Twice, so a day whose offset changes (summer time) still lands on its midnight.
  let at = midnightUtc - zoneOffsetMs(new Date(midnightUtc), timeZone);
  at = midnightUtc - zoneOffsetMs(new Date(at), timeZone);
  return new Date(at);
}

/** A date column (Postgres DATE, e.g. FiscalDocument.invoiceDate) holds the day as UTC midnight. */
export function dateColumnValue(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export interface ExportPeriod {
  /** First and last calendar day, inclusive ("2026-10-01", "2026-10-31"). */
  startDate: string;
  endDate: string;
  timeZone: string;
  /** For timestamps: from the first instant of startDate there (inclusive)… */
  from: Date;
  /** …to the first instant of the day after endDate there (exclusive). */
  until: Date;
  fiscalYear: number;
}

/**
 * Checks and pins down a period. A SAF-T file covers part of one fiscal
 * year (the calendar year in Angola), so both dates must be in the same year.
 */
export function exportPeriod(startDate: unknown, endDate: unknown, timeZone: string, options: { sameYear?: boolean } = {}): ExportPeriod {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (start > end) throw new BadRequestException("The start date is after the end date");
  if (options.sameYear && start.slice(0, 4) !== end.slice(0, 4)) {
    throw new BadRequestException("A SAF-T file covers one fiscal year: the start and end dates must be in the same year");
  }
  return {
    startDate: start,
    endDate: end,
    timeZone,
    from: startOfLocalDay(start, timeZone),
    until: startOfLocalDay(addDays(end, 1), timeZone),
    fiscalYear: Number(start.slice(0, 4)),
  };
}

/** The last calendar month as the shop's clock sees it today: the monthly SAF-T file's period. */
export function previousMonth(now: Date, timeZone: string): { startDate: string; endDate: string } {
  const today = localDateTime(now, timeZone);
  const firstOfThisMonth = `${today.date.slice(0, 7)}-01`;
  const endDate = addDays(firstOfThisMonth, -1);
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}

/** 31 December of last year as the shop's clock sees it: the inventory file's date. */
export function lastYearEnd(now: Date, timeZone: string): string {
  return `${localDateTime(now, timeZone).year - 1}-12-31`;
}

/** The day a timestamp falls on in the zone. */
export function localDate(at: Date, timeZone: string): string {
  return localDateTime(at, timeZone).date;
}
