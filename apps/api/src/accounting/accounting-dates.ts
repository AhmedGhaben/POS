import { countryConfig } from "../countries";
import { fiscalTimeZone, localDateTime } from "../fiscal/fiscal-format";

/** The business's books run on its country's clock (Angola: Africa/Luanda). */
export function businessTimeZone(business: { country: string }): string {
  return fiscalTimeZone(null, countryConfig(business.country)?.timeZone);
}

/** Today, as YYYY-MM-DD, on the business's clock. */
export function businessToday(business: { country: string }, now = new Date()): string {
  return localDateTime(now, businessTimeZone(business)).date;
}

/** A Postgres DATE column value (the day at UTC midnight) as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → the DATE column value. */
export function dateValue(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
