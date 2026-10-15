import { Prisma } from "@prisma/client";
import { AO } from "../countries";
import { documentLine, documentTotals, partOfLine, type SourceLine } from "./document-lines";
import { documentNumber, fiscalTimeZone, localDateTime, storeSeriesCode, terminalSeriesCode } from "./fiscal-format";

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);

function line(extra: Partial<SourceLine> = {}): SourceLine {
  return {
    productId: "p1",
    productCode: "ARZ-1",
    productDescription: "Arroz 1kg",
    quantity: D(2),
    unit: "un",
    lineTotal: D("20.00"),
    taxAmount: D("2.46"),
    discountAmount: D(0),
    taxRate: D(14),
    taxCode: "NOR",
    exemptionCode: null,
    region: "AO",
    ...extra,
  };
}

describe("fiscal document lines", () => {
  it("shows amounts without tax: net = paid - tax, unit price = net / quantity", () => {
    const l = documentLine(line(), 1, AO, true);
    expect(l.netAmount.toString()).toBe("17.54");
    expect(l.taxAmount.toString()).toBe("2.46");
    expect(l.grossAmount.toString()).toBe("20");
    expect(l.unitPrice.toString()).toBe("8.77");
    expect(l.taxes).toEqual([
      expect.objectContaining({ taxType: "IVA", taxCountryRegion: "AO", taxCode: "NOR", exemptionCode: null, exemptionReason: null }),
    ]);
  });

  it("a discount on prices with IVA is shown without it, in proportion to the base", () => {
    // Paid 20.00 after 2.00 off; base 17.54 -> discount 2.00 x 17.54 / 20 = 1.75
    const l = documentLine(line({ discountAmount: D(2) }), 1, AO, true);
    expect(l.discountAmount.toString()).toBe("1.75");
    // Without IVA in the price the discount is already without tax.
    expect(documentLine(line({ discountAmount: D(2) }), 1, AO, false).discountAmount.toString()).toBe("2");
  });

  it("an exempt line carries the AGT reason's legal wording", () => {
    const l = documentLine(line({ taxRate: D(0), taxCode: "ISE", exemptionCode: "M10", taxAmount: D(0) }), 1, AO, true);
    expect(l.taxes[0]).toMatchObject({ taxCode: "ISE", exemptionCode: "M10" });
    expect(l.taxes[0].exemptionReason).toMatch(/^Isento nos termos da al/);
    expect(l.taxes[0].exemptionReason!.length).toBeLessThanOrEqual(60);
  });

  it("older sales without a recorded rate get it from the tax amount", () => {
    const l = documentLine(line({ taxRate: null, taxCode: null, lineTotal: D("11.40"), taxAmount: D("1.40") }), 1, AO, false);
    expect(l.taxes[0].percentage.toString()).toBe("14");
    expect(l.taxes[0].taxCode).toBe("NOR");
  });

  it("a credit note takes its part of a line and points at the original", () => {
    const part = partOfLine(line({ quantity: D(3), lineTotal: D("30.00"), taxAmount: D("3.69") }), 1);
    expect(part.lineTotal.toString()).toBe("10");
    expect(part.taxAmount.toString()).toBe("1.23");
    const l = documentLine(part, 1, AO, true, { documentNo: "FR POS001-2026/7", lineNumber: 2 });
    expect(l).toMatchObject({ referenceDocumentNo: "FR POS001-2026/7", referenceLineNumber: 2 });
    expect(l.netAmount.toString()).toBe("8.77");
  });

  it("totals add up the lines", () => {
    const t = documentTotals([documentLine(line(), 1, AO, true), documentLine(line({ lineTotal: D("5"), taxAmount: D(0), taxRate: D(0), exemptionCode: "M10" }), 2, AO, true)]);
    expect([t.netTotal, t.taxPayable, t.grossTotal].map(String)).toEqual(["22.54", "2.46", "25"]);
  });
});

describe("fiscal formats", () => {
  it("dates are the shop's: Luanda is UTC+1, so 23:30 UTC is the next day", () => {
    expect(localDateTime(new Date("2026-12-31T23:30:05Z"), "Africa/Luanda")).toEqual({
      date: "2027-01-01",
      dateTime: "2027-01-01T00:30:05",
      year: 2027,
      month: 1,
    });
    expect(fiscalTimeZone("UTC", "Africa/Luanda")).toBe("Africa/Luanda");
    expect(fiscalTimeZone("Europe/Lisbon", "Africa/Luanda")).toBe("Europe/Lisbon");
  });

  it("series codes and document numbers match the SAF-T InvoiceNo pattern", () => {
    expect(terminalSeriesCode("POS-001", 2026)).toBe("POS001-2026");
    expect(storeSeriesCode(2, 2026)).toBe("WEB2-2026");
    const no = documentNumber("FR", "POS001-2026", 57);
    expect(no).toBe("FR POS001-2026/57");
    expect(no).toMatch(/^[^ ]+ [^/^ ]+\/[0-9]+$/);
  });
});
