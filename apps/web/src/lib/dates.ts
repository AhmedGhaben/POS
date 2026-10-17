import { countryConfig } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { currentLanguage } from "@/i18n";

/**
 * Dates as people read them: the STORE's country decides the format, not
 * the screen language (Angola, pt-AO: 17/10/2026 and 17/10/2026 14:05),
 * so a cashier using English screens still sees the dates on the
 * documents. Machine formats (SAF-T, AGT, the hash, the QR, the database)
 * stay ISO and never come through here.
 */

/** The date locale of a country: its config's, else the screen language (no country config). */
export function dateLocaleFor(country: string | null | undefined): string {
  return countryConfig(country)?.locale ?? currentLanguage();
}

/** The date locale for the store being worked in (or the business, before a store is picked). */
export function dateLocale(): string {
  const { stores, currentStoreId, business } = useAuthStore.getState();
  const store = stores.find((s) => s.id === currentStoreId);
  return dateLocaleFor(store?.country ?? business?.country);
}

const formats = new Map<string, Intl.DateTimeFormat>();
function format(locale: string, kind: "date" | "time" | "dayMonth", utc: boolean): Intl.DateTimeFormat {
  const key = `${kind}|${locale}|${utc}`;
  let f = formats.get(key);
  if (!f) {
    const options: Intl.DateTimeFormatOptions =
      kind === "date"
        ? { day: "2-digit", month: "2-digit", year: "numeric" }
        : kind === "dayMonth"
          ? { day: "2-digit", month: "2-digit" }
          : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    f = new Intl.DateTimeFormat(locale, utc ? { ...options, timeZone: "UTC" } : options);
    formats.set(key, f);
  }
  return f;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date ("2026-10-31") is the same day everywhere: read it at UTC midnight and print it in UTC. */
function asDate(value: string | Date): { at: Date; utc: boolean } {
  if (typeof value === "string" && CALENDAR_DATE.test(value)) return { at: new Date(`${value}T00:00:00Z`), utc: true };
  return { at: new Date(value), utc: false };
}

/** Date only: 17/10/2026 (pt-AO). Accepts an instant or a calendar date ("2026-10-17"). */
export function formatDate(value: string | Date, locale: string = dateLocale()): string {
  const { at, utc } = asDate(value);
  return format(locale, "date", utc).format(at);
}

/** Date and time: 17/10/2026 14:05 (pt-AO), always 24-hour. */
export function formatDateTime(value: string | Date, locale: string = dateLocale()): string {
  const { at, utc } = asDate(value);
  return `${format(locale, "date", utc).format(at)} ${format(locale, "time", utc).format(at)}`;
}

/** A calendar date ("2026-10-31") as written, whatever the computer's time zone: 31/10/2026. */
export function formatCalendarDate(date: string, locale: string = dateLocale()): string {
  return format(locale, "date", true).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/** Day and month for chart axes, where the year is in the title: 17/10. */
export function formatShortDate(date: string, locale: string = dateLocale()): string {
  return format(locale, "dayMonth", true).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/** A month ("2026-10") in words, in the given language: "outubro de 2026". Not a date, so it follows the language. */
export function formatMonth(month: string, language: string = currentLanguage()): string {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(language, { month: "long", year: "numeric", timeZone: "UTC" });
}

type Part = "day" | "month" | "year";

/** The order of day, month and year in a locale's dates, and what separates them: pt-AO → day/month/year, "/". */
export function dateOrder(locale: string = dateLocale()): { order: Part[]; separator: string } {
  const parts = format(locale, "date", true).formatToParts(new Date(Date.UTC(2026, 10, 22)));
  const order = parts.filter((p): p is Intl.DateTimeFormatPart & { type: Part } => p.type === "day" || p.type === "month" || p.type === "year").map((p) => p.type);
  const separator = parts.find((p) => p.type === "literal")?.value.trim() || "/";
  return { order, separator };
}

/**
 * What someone typed in a date field, as an ISO calendar date, or null if
 * it isn't a real date yet. Takes the locale's order (17/10/2026, 17-10-2026,
 * 17.10.2026, 1/2/2026) and ISO (2026-10-17) as pasted from elsewhere.
 */
export function parseDateInput(text: string, locale: string = dateLocale()): string | null {
  const trimmed = text.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const pieces = trimmed.split(/[/.\-\s]+/);
    if (pieces.length !== 3 || pieces.some((p) => !/^\d+$/.test(p))) return null;
    const { order } = dateOrder(locale);
    const value = (part: Part) => pieces[order.indexOf(part)];
    if (value("year").length !== 4) return null;
    [y, m, d] = [Number(value("year")), Number(value("month")), Number(value("day"))];
  }
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null;
  return at.toISOString().slice(0, 10);
}
