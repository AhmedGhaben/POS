/**
 * How a sale's money is worked out: line discounts, a whole-sale discount
 * spread over the lines, then tax on what's left. Used by the till, its
 * offline receipts, quotes and invoices (packages/shared/src/pricing.ts) and
 * by the server, which charges exactly what the till showed. The API keeps a
 * byte-identical copy in apps/api/src/sales/pricing.ts (it can't import the
 * shared package at runtime); apps/api/src/sales/pricing.spec.ts checks it.
 *
 * Everything is in cents (whole numbers), so nothing drifts by rounding.
 * Quantities have up to 3 decimals (1.25 kg) and are counted in thousandths.
 *
 * Tax per line is rounded up to the cent (docs/plans/ANGOLA.md, decision 6):
 * - prices with tax (the shelf price includes IVA):
 *   tax = ceil(amount x rate / (100 + rate)), net = amount - tax, so net +
 *   tax is always exactly the shelf price;
 * - prices without tax: tax = ceil(net x rate / 100), total = net + tax.
 */

export type DiscountType = "PERCENT" | "AMOUNT";

export interface DiscountInput {
  type: DiscountType;
  /** A percentage (0-100) or an amount in the currency, e.g. 2.5. */
  value: number;
}

export interface PricingLineInput {
  /** Price per item (or per kg, litre...) in the currency, e.g. 2.99. */
  unitPrice: number;
  /** Up to 3 decimals. */
  quantity: number;
  /** Percent, e.g. 14. */
  taxRate: number;
  discount?: DiscountInput | null;
}

export interface PricingOptions {
  /** Prices include tax (the store's setting). */
  taxIncluded?: boolean;
}

export interface PricedLine {
  /** unitPrice x quantity, as priced (with tax when prices include it). */
  gross: number;
  /** This line's own discount. */
  lineDiscount: number;
  /** Its share of the whole-sale discount. */
  saleDiscountShare: number;
  /** lineDiscount + saleDiscountShare. */
  discount: number;
  /** What tax is charged on, without tax. */
  net: number;
  tax: number;
  /** net + tax: what the customer pays for the line (gross - discount when prices include tax). */
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
  /** subtotal - discountTotal, plus taxTotal when prices don't include it. */
  total: number;
  /** The prices included tax: the tax is part of the subtotal, not added to it. */
  taxIncluded: boolean;
}

/** How each product is counted. Only "un" stays whole numbers (decision 8). */
export const UNITS = [
  { code: "un", decimals: 0 },
  { code: "kg", decimals: 3 },
  { code: "g", decimals: 3 },
  { code: "l", decimals: 3 },
  { code: "m", decimals: 3 },
  { code: "cx", decimals: 3 },
] as const;

export type UnitCode = (typeof UNITS)[number]["code"];

export const UNIT_CODES: readonly string[] = UNITS.map((u) => u.code);

/** Decimal places a quantity in this unit may have (unknown units count as whole). */
export function unitDecimals(unit: string | null | undefined): number {
  return UNITS.find((u) => u.code === unit)?.decimals ?? 0;
}

/** A quantity rounded to what its unit allows. */
export function roundQuantity(quantity: number, unit: string | null | undefined): number {
  const f = 10 ** unitDecimals(unit);
  return Math.round(quantity * f) / f;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Thousandths of a unit: 1.25 kg is 1250. */
export function toMilli(quantity: number): number {
  return Math.round(quantity * 1000);
}

/** price x quantity in cents, rounded half up, without floating-point drift. */
export function lineGrossCents(unitPrice: number, quantity: number): number {
  return Math.floor((toCents(unitPrice) * toMilli(quantity) + 500) / 1000);
}

/** The tax on `amount` cents, rounded up to the cent; `taxIncluded` when the amount already contains it. */
export function taxCents(amount: number, rate: number, taxIncluded: boolean): number {
  const basisPoints = Math.round(rate * 100);
  if (amount <= 0 || basisPoints <= 0) return 0;
  return Math.ceil((amount * basisPoints) / (taxIncluded ? 10_000 + basisPoints : 10_000));
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
export function priceSaleCents(
  lines: PricingLineInput[],
  saleDiscount?: DiscountInput | null,
  options: PricingOptions = {},
): PricedSale {
  const taxIncluded = !!options.taxIncluded;
  const gross = lines.map((l) => lineGrossCents(l.unitPrice, l.quantity));
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
    const amount = gross[i] - discount;
    const tax = taxCents(amount, l.taxRate, taxIncluded);
    const net = taxIncluded ? amount - tax : amount;
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
    taxIncluded,
  };
}

/** The same, in currency units (e.g. 2.99), for screens and documents. */
export function priceSale(
  lines: PricingLineInput[],
  saleDiscount?: DiscountInput | null,
  options: PricingOptions = {},
): PricedSale {
  const c = priceSaleCents(lines, saleDiscount, options);
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
    taxIncluded: c.taxIncluded,
  };
}

/** A discount as a percentage of what it applies to, for the maximum-discount check. */
export function discountPercent(discount: number, base: number): number {
  return base > 0 ? (discount / base) * 100 : 0;
}
