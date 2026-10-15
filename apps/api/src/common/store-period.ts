import { countryConfig } from "../countries";
import { fiscalTimeZone } from "../fiscal/fiscal-format";
import { addDays, parseCalendarDate, startOfLocalDay } from "../fiscal/saft/period";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * A list filter's "from"/"to" calendar dates (YYYY-MM-DD, either optional)
 * as a timestamp range in the store's time zone: from local midnight of
 * "from" to local midnight after "to". Same rules as the SAF-T exports.
 */
export async function storeDateRange(
  prisma: PrismaService,
  storeId: string,
  from?: string,
  to?: string,
): Promise<{ gte?: Date; lt?: Date } | undefined> {
  if (!from && !to) return undefined;
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { timezone: true, country: true } });
  const tz = fiscalTimeZone(store.timezone, countryConfig(store.country)?.timeZone);
  return {
    ...(from ? { gte: startOfLocalDay(parseCalendarDate(from), tz) } : {}),
    ...(to ? { lt: startOfLocalDay(addDays(parseCalendarDate(to), 1), tz) } : {}),
  };
}

/** Paging from query strings: at most 200 a page. */
export function paging(take?: string, skip?: string): { take: number; skip: number } {
  const t = Number(take);
  const s = Number(skip);
  return { take: Number.isInteger(t) && t > 0 ? Math.min(t, 200) : 50, skip: Number.isInteger(s) && s >= 0 ? s : 0 };
}
