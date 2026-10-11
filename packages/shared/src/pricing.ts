/**
 * How a sale's money is worked out: line discounts, a whole-sale discount
 * spread over the lines, then tax on what's left. Used by the till, its
 * offline receipts, quotes and invoices. The API has a copy in
 * apps/api/src/sales/pricing.ts (it can't import this package at runtime);
 * a test there checks the two always agree.
 *
 * Everything is in cents (whole numbers), so nothing drifts by rounding.
 */

export type DiscountType = "PERCENT" | "AMOUNT";

export interface DiscountInput {
  type: DiscountType;
  /** A percentage (0-100) or an amount in the currency, e.g. 2.5. */
  value: number;
}

export interface PricingLineInput {
  /** Price per item in the currency, e.g. 2.99. */
  unitPrice: number;
  quantity: number;
  /** Percent, e.g. 14. */
  taxRate: number;
  discount?: DiscountInput | null;
}

export interface PricedLine {
  /** unitPrice x quantity. */
  gross: number;
  /** This line's own discount. */
  lineDiscount: number;
  /** Its share of the whole-sale discount. */
  saleDiscountShare: number;
  /** lineDiscount + saleDiscountShare. */
  discount: number;
  /** gross - discount: what tax is charged on. */
  net: number;
  tax: number;
  /** net + tax. */
  total: number;
}

export interface PricedSale {
  lines: PricedLine[];
  /** Sum of gross, before any discount. */
  subtotal: number;
  /** The whole-sale discount alone. */
  saleDiscount: number;
  /** Every discount: line discounts plus the whole-sale one. */
  discountTotal: number;
  taxTotal: number;
  total: number;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** A discount in cents on `base` cents, never more than the base. */
export function discountCents(base: number, discount: DiscountInput | null | undefined): number {
  if (!discount || !(discount.value > 0) || base <= 0) return 0;
  const raw = discount.type === "PERCENT" ? Math.round((base * Math.min(discount.value, 100)) / 100) : toCents(discount.value);
  return Math.min(raw, base);
}

/**
 * Prices a sale, in cents. The whole-sale discount is shared out in
 * proportion to each line's amount after its own discount; the cents left
 * over by rounding go one each to the lines with the largest remainders.
 */
export function priceSaleCents(lines: PricingLineInput[], saleDiscount?: DiscountInput | null): PricedSale {
  const gross = lines.map((l) => toCents(l.unitPrice) * l.quantity);
  const lineDiscount = lines.map((l, i) => discountCents(gross[i], l.discount));
  const afterLine = gross.map((g, i) => g - lineDiscount[i]);
  const base = afterLine.reduce((a, b) => a + b, 0);
  const saleOff = discountCents(base, saleDiscount);

  const share = afterLine.map((a) => (base > 0 ? Math.floor((saleOff * a) / base) : 0));
  let left = saleOff - share.reduce((a, b) => a + b, 0);
  const order = afterLine
    .map((a, i) => ({ i, rest: base > 0 ? (saleOff * a) % base : 0 }))
    .sort((x, y) => y.rest - x.rest || afterLine[y.i] - afterLine[x.i] || x.i - y.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (share[i] < afterLine[i]) {
      share[i]++;
      left--;
    }
  }

  const priced: PricedLine[] = lines.map((l, i) => {
    const discount = lineDiscount[i] + share[i];
    const net = gross[i] - discount;
    const tax = Math.round((net * l.taxRate) / 100);
    return { gross: gross[i], lineDiscount: lineDiscount[i], saleDiscountShare: share[i], discount, net, tax, total: net + tax };
  });
  const sum = (pick: (l: PricedLine) => number) => priced.reduce((a, l) => a + pick(l), 0);
  return {
    lines: priced,
    subtotal: sum((l) => l.gross),
    saleDiscount: saleOff,
    discountTotal: sum((l) => l.discount),
    taxTotal: sum((l) => l.tax),
    total: sum((l) => l.total),
  };
}

/** The same, in currency units (e.g. 2.99), for screens and documents. */
export function priceSale(lines: PricingLineInput[], saleDiscount?: DiscountInput | null): PricedSale {
  const c = priceSaleCents(lines, saleDiscount);
  const line = (l: PricedLine): PricedLine => ({
    gross: fromCents(l.gross),
    lineDiscount: fromCents(l.lineDiscount),
    saleDiscountShare: fromCents(l.saleDiscountShare),
    discount: fromCents(l.discount),
    net: fromCents(l.net),
    tax: fromCents(l.tax),
    total: fromCents(l.total),
  });
  return {
    lines: c.lines.map(line),
    subtotal: fromCents(c.subtotal),
    saleDiscount: fromCents(c.saleDiscount),
    discountTotal: fromCents(c.discountTotal),
    taxTotal: fromCents(c.taxTotal),
    total: fromCents(c.total),
  };
}

/** A discount as a percentage of what it applies to, for the maximum-discount check. */
export function discountPercent(discount: number, base: number): number {
  return base > 0 ? (discount / base) * 100 : 0;
}
