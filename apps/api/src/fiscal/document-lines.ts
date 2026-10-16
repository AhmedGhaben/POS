import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { findExemption, lacksExemptionReason, type CountryConfig } from "../countries";

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const ZERO = new Prisma.Decimal(0);

/** A sale line (or part of one, for a credit note) as recorded. */
export interface SourceLine {
  productId: string | null;
  productCode: string;
  productDescription: string;
  quantity: Prisma.Decimal;
  unit: string;
  /** What the customer paid for it: net + tax. */
  lineTotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  /** Everything taken off the line, as priced (with tax when prices include it). */
  discountAmount: Prisma.Decimal;
  /** As charged; null on sales from before it was recorded. */
  taxRate: Prisma.Decimal | null;
  taxCode: string | null;
  exemptionCode: string | null;
  /** "AO", or "AO-CAB" for the Cabinda rate. */
  region: string;
}

export interface DocumentLineData {
  lineNumber: number;
  productId: string | null;
  productCode: string;
  productDescription: string;
  quantity: Prisma.Decimal;
  unit: string;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  referenceDocumentNo: string | null;
  referenceLineNumber: number | null;
  taxes: {
    taxType: string;
    taxCountryRegion: string;
    taxCode: string;
    percentage: Prisma.Decimal;
    amount: Prisma.Decimal;
    exemptionCode: string | null;
    exemptionReason: string | null;
  }[];
}

/** The refusal when a line is exempt without a reason (see `lacksExemptionReason`). */
export function missingExemptionMessage(productDescription: string): string {
  return `"${productDescription}" is exempt from IVA without a reason: a manager must fix the product first`;
}

/**
 * A document line from a sale line. Documents show amounts without tax:
 * net = what was paid - tax, the unit price is net / quantity, and a
 * discount given on prices with IVA is shown without it, in proportion.
 * No document is issued with an exempt line that has no M-code: SAF-T and
 * AGT need it (a store under Simplificado or Exclusão gets M00 / M04).
 */
export function documentLine(
  src: SourceLine,
  lineNumber: number,
  config: CountryConfig | null,
  pricesIncludeTax: boolean,
  reference: { documentNo: string; lineNumber: number | null } | null = null,
): DocumentLineData {
  const gross = src.lineTotal.toDecimalPlaces(2);
  const tax = src.taxAmount.toDecimalPlaces(2);
  const net = gross.sub(tax);
  const rate = src.taxRate ?? (net.gt(0) ? tax.div(net).mul(100).toDecimalPlaces(2) : ZERO);
  const discount = pricesIncludeTax
    ? gross.gt(0)
      ? src.discountAmount.mul(net).div(gross).toDecimalPlaces(2)
      : src.discountAmount.mul(100).div(rate.add(100)).toDecimalPlaces(2)
    : src.discountAmount.toDecimalPlaces(2);
  const taxCode = src.taxCode ?? (rate.gt(0) ? "NOR" : "ISE");
  const exemptionCode = rate.gt(0) ? null : src.exemptionCode;
  if (lacksExemptionReason(config, { rate: rate.toNumber(), exemptionCode })) {
    throw new BadRequestException(missingExemptionMessage(src.productDescription));
  }
  const exemption = exemptionCode && config ? findExemption(config, exemptionCode) : null;
  return {
    lineNumber,
    productId: src.productId,
    productCode: src.productCode,
    productDescription: src.productDescription,
    quantity: src.quantity,
    unit: src.unit,
    unitPrice: src.quantity.gt(0) ? net.div(src.quantity).toDecimalPlaces(6) : ZERO,
    discountAmount: discount,
    netAmount: net,
    taxAmount: tax,
    grossAmount: gross,
    referenceDocumentNo: reference?.documentNo ?? null,
    referenceLineNumber: reference?.lineNumber ?? null,
    taxes: [
      {
        taxType: "IVA",
        taxCountryRegion: src.region,
        taxCode,
        percentage: rate,
        amount: tax,
        exemptionCode,
        exemptionReason: exemption?.legalText ?? null,
      },
    ],
  };
}

/** Part of a sale line, for a credit note: the amounts in proportion to the quantity returned. */
export function partOfLine(src: SourceLine, quantity: Prisma.Decimal.Value): SourceLine {
  const q = D(quantity);
  if (q.equals(src.quantity)) return src;
  const share = (amount: Prisma.Decimal) => amount.mul(q).div(src.quantity).toDecimalPlaces(2);
  return { ...src, quantity: q, lineTotal: share(src.lineTotal), taxAmount: share(src.taxAmount), discountAmount: share(src.discountAmount) };
}

export function documentTotals(lines: DocumentLineData[]) {
  const sum = (pick: (l: DocumentLineData) => Prisma.Decimal) => lines.reduce((a, l) => a.add(pick(l)), ZERO);
  return { netTotal: sum((l) => l.netAmount), taxPayable: sum((l) => l.taxAmount), grossTotal: sum((l) => l.grossAmount), discountTotal: sum((l) => l.discountAmount) };
}
