/**
 * The till's half of the hash chain: the message it signs for each document,
 * exactly as the server rebuilds it to check (apps/api/src/fiscal/
 * signature.ts#hashMessage and fiscal-format.ts#localDateTime; hash.test.ts
 * holds them to the same test vector).
 */

/** InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;previous hash */
export function hashMessage(f: { invoiceDate: string; systemEntryDate: string; documentNo: string; grossTotal: string; previousHash: string }): string {
  return `${f.invoiceDate};${f.systemEntryDate};${f.documentNo};${f.grossTotal};${f.previousHash}`;
}

/** Characters 1, 11, 21 and 31 of the hash, printed before the certification line. */
export function hashExcerpt(hash: string): string {
  return [0, 10, 20, 30].map((i) => hash.charAt(i)).join("");
}

/** A moment as the shop's clock showed it: YYYY-MM-DD and YYYY-MM-DDThh:mm:ss. */
export function localDateTime(at: Date, timeZone: string): { date: string; dateTime: string; year: number } {
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
  return { date, dateTime: `${date}T${parts.hour}:${parts.minute}:${parts.second}`, year: Number(parts.year) };
}

/** The store's time zone; stores left on UTC take the country's (Angola: Africa/Luanda). */
export function fiscalTimeZone(storeTimeZone: string | null | undefined, countryTimeZone: string | null | undefined): string {
  return storeTimeZone && storeTimeZone !== "UTC" ? storeTimeZone : countryTimeZone || "UTC";
}
