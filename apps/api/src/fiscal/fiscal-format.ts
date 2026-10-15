/**
 * Small pure helpers for fiscal documents: dates as AGT wants them, in the
 * store's time zone, series codes, and the annulment reasons.
 */

export interface LocalDateTime {
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DDThh:mm:ss */
  dateTime: string;
  year: number;
  month: number;
}

/** A moment as the shop's clock showed it. */
export function localDateTime(at: Date, timeZone: string): LocalDateTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, dateTime: `${date}T${parts.hour}:${parts.minute}:${parts.second}`, year: Number(parts.year), month: Number(parts.month) };
}

/** The store's time zone; stores left on UTC take the country's (Angola: Africa/Luanda). */
export function fiscalTimeZone(storeTimeZone: string | null | undefined, countryTimeZone: string | null | undefined): string {
  return storeTimeZone && storeTimeZone !== "UTC" ? storeTimeZone : countryTimeZone || "UTC";
}

/** A till's series code: POS-001 numbers "POS001-2026". */
export function terminalSeriesCode(terminalCode: string, year: number): string {
  return `${terminalCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}-${year}`;
}

/** A store's own series (browser sales, back office): the store's place in the business, "WEB1-2026". */
export function storeSeriesCode(storeIndex: number, year: number): string {
  return `WEB${storeIndex}-${year}`;
}

/** "FR POS001-2026/57" */
export function documentNumber(documentType: string, seriesCode: string, number: number): string {
  return `${documentType} ${seriesCode}/${number}`;
}

/** Amounts in the hash and exports: two decimals with a dot. */
export function fixed2(value: { toFixed(n: number): string }): string {
  return value.toFixed(2);
}

/**
 * The AGT annulment code of a cancel reason: I, the customer was wrongly
 * identified; N, the document never reached the customer. Only these two
 * annul a fiscal document (the wording is in the country config); anything
 * else is corrected with a credit note. Same as @pos/shared annulmentCode.
 */
export function annulmentCode(reason: string): "I" | "N" | null {
  return reason === "ANNUL_I" ? "I" : reason === "ANNUL_N" ? "N" : null;
}
