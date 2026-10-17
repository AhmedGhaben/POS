/**
 * Accounting periods (docs/ACCOUNTING-DECISIONS.md, decision 18): the year
 * is the calendar year; period 0 is the opening, 1-12 the months, 13-15
 * the year-end on 31 December.
 */
export const OPENING_PERIOD = 0;
export const ADJUSTMENTS_PERIOD = 13;
export const RESULTS_PERIOD = 14;
export const NET_RESULT_PERIOD = 15;
export const PERIOD_NUMBERS = Array.from({ length: 16 }, (_, i) => i);

/** First and last day of a period, as YYYY-MM-DD. */
export function periodDates(year: number, number: number): { startDate: string; endDate: string } {
  if (number === OPENING_PERIOD) return { startDate: `${year}-01-01`, endDate: `${year}-01-01` };
  if (number > 12) return { startDate: `${year}-12-31`, endDate: `${year}-12-31` };
  const mm = String(number).padStart(2, "0");
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { startDate: `${year}-${mm}-01`, endDate: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** The month period a date falls in (1-12). */
export function monthPeriod(date: string): { year: number; number: number } {
  return { year: Number(date.slice(0, 4)), number: Number(date.slice(5, 7)) };
}

/**
 * Whether an entry dated `date` may go in `number`: a month takes its own
 * dates; 13-15 only 31 December; the opening only 1 January.
 */
export function dateFitsPeriod(date: string, year: number, number: number): boolean {
  if (Number(date.slice(0, 4)) !== year) return false;
  const { startDate, endDate } = periodDates(year, number);
  return date >= startDate && date <= endDate;
}
