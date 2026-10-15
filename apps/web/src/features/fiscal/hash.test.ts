import { describe, expect, it } from "vitest";
import { fiscalTimeZone, hashExcerpt, hashMessage, localDateTime } from "./hash";

/** The server checks the till's signature over this same message (apps/api/src/fiscal/signature.spec.ts). */
describe("the till's hash message", () => {
  it("is the server's: InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;previous hash", () => {
    expect(
      hashMessage({ invoiceDate: "2026-10-15", systemEntryDate: "2026-10-15T10:20:30", documentNo: "FR POS001-2026/1", grossTotal: "1250.00", previousHash: "" }),
    ).toBe("2026-10-15;2026-10-15T10:20:30;FR POS001-2026/1;1250.00;");
  });

  it("uses the shop's clock (Luanda is UTC+1) and prints hash characters 1, 11, 21, 31", () => {
    expect(localDateTime(new Date("2026-12-31T23:30:05Z"), fiscalTimeZone("UTC", "Africa/Luanda"))).toEqual({
      date: "2027-01-01",
      dateTime: "2027-01-01T00:30:05",
      year: 2027,
    });
    // The server's test vector's first signature starts "VHTUZovonL2sQBAa9Qw5y/jTQd/uNxq0".
    expect(hashExcerpt("VHTUZovonL2sQBAa9Qw5y/jTQd/uNxq0pfmf2lw4")).toBe("V2yq");
  });
});
