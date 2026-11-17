import { countryConfig } from "@pos/shared";
import { fiscalTimeZone } from "@/features/fiscal/hash";
import { dateLocaleFor } from "@/lib/dates";

export type WhenKind = "today" | "yesterday" | "other";

export interface StatusWhen {
  kind: WhenKind;
  /** "14:09" on the store's clock. */
  time: string;
  /** "16/11" in the store country's day/month order. */
  date: string;
}

/** YYYY-MM-DD of a moment on a given clock. */
function dayOn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * When something happened, on the store's clock (Angola: WAT, UTC+1), for
 * "sincronizada às 14:09", "ontem às 21:04", "16/11 às 09:30". Stores left
 * on UTC take their country's time zone, as documents do.
 */
export function statusWhen(iso: string, store: { timezone: string; country: string }, now: Date = new Date()): StatusWhen {
  const at = new Date(iso);
  const timeZone = fiscalTimeZone(store.timezone, countryConfig(store.country)?.timeZone);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const date = new Intl.DateTimeFormat(dateLocaleFor(store.country), { timeZone, day: "2-digit", month: "2-digit" }).format(at);
  const today = dayOn(now, timeZone);
  const yesterday = dayOn(new Date(now.getTime() - 24 * 3600_000), timeZone);
  const day = dayOn(at, timeZone);
  return { kind: day === today ? "today" : day === yesterday ? "yesterday" : "other", time, date };
}
