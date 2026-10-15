import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/**
 * The IVA on a purchase (docs/plans/ANGOLA.md, phase 4): per rate, what was
 * supported, the deductible part and its type (SAF-T Deductible), and the
 * IVA cativo withheld for the State. Pure, tested on its own.
 */

type Money = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface TaxLineInput {
  taxRate: number;
  base: number;
  taxAmount?: number;
  deductiblePercent?: number;
  typology?: string;
}

export interface PurchaseTaxes {
  lines: { taxRate: Money; base: Money; taxAmount: Money; deductiblePercent: Money; deductibleAmount: Money; typology: string }[];
  taxTotal: Money;
  withholdingAmount: Money;
}

const round2 = (v: Money) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * The bases must add up to the lines' total (without IVA), so the purchase
 * total is that plus the IVA. The tax defaults to base × rate, rounded to
 * the cent; the supplier's own figure wins when given.
 */
export function purchaseTaxes(subtotal: Money, lines: TaxLineInput[] | undefined, withholdingPercent: number | undefined): PurchaseTaxes {
  const out = (lines ?? []).map((l) => {
    const base = D(l.base);
    const taxAmount = l.taxAmount !== undefined ? D(l.taxAmount) : round2(base.times(l.taxRate).div(100));
    const deductiblePercent = D(l.deductiblePercent ?? 100);
    return { taxRate: D(l.taxRate), base, taxAmount, deductiblePercent, deductibleAmount: round2(taxAmount.times(deductiblePercent).div(100)), typology: l.typology ?? "INV" };
  });
  if (out.length > 0) {
    const bases = out.reduce((s, l) => s.add(l.base), D(0));
    if (bases.sub(subtotal).abs().gt(0.01)) throw new BadRequestException("The IVA bases must add up to the purchase total without IVA");
  }
  const taxTotal = out.reduce((s, l) => s.add(l.taxAmount), D(0));
  if (withholdingPercent && taxTotal.isZero()) throw new BadRequestException("IVA cativo needs IVA on the purchase");
  return { lines: out, taxTotal, withholdingAmount: round2(taxTotal.times(withholdingPercent ?? 0).div(100)) };
}
