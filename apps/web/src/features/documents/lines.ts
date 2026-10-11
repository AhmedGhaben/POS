import type { DiscountInput, SaleLineItemDto } from "@pos/shared";
import { priceCart, type CartLine } from "@/features/pos/hooks/useCart";

/** One row on a quote or invoice. Amounts are numbers in the business currency. */
export interface DocumentLine {
  key: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  /** Percent, e.g. 19. */
  taxRate: number;
  /** unitPrice x quantity, before any discount. */
  lineGross: number;
  /** This line's own discount. */
  lineDiscount: number;
  /** Everything off this line, including its share of a whole-sale discount. */
  discount: number;
  /** After discounts, before tax. */
  net: number;
  tax: number;
  gross: number;
}

export interface DocumentTotals {
  /** Before discounts, before tax. */
  subtotal: number;
  /** Every discount. */
  discount: number;
  /** The whole-sale discount alone. */
  saleDiscount: number;
  /** After discounts, before tax. */
  net: number;
  tax: number;
  gross: number;
  /** One row per tax rate, as invoices usually require. */
  byRate: { rate: number; net: number; tax: number }[];
}

/** Same pricing as the POS screen and the server, so a quote matches the till. */
export function linesFromCart(lines: CartLine[], saleDiscount: DiscountInput | null = null): DocumentLine[] {
  const priced = priceCart(lines, saleDiscount);
  return lines.map(({ product, quantity }, i) => {
    const p = priced.lines[i];
    return {
      key: product.id,
      name: product.name,
      sku: product.sku,
      quantity,
      unitPrice: Number(product.sellPrice),
      taxRate: Number(product.taxRate),
      lineGross: p.gross,
      lineDiscount: p.lineDiscount,
      discount: p.discount,
      net: p.net,
      tax: p.tax,
      gross: p.total,
    };
  });
}

/**
 * From a completed sale. The rate is derived from the stored tax amount, not
 * the product's current rate, which may have changed since the sale.
 */
export function linesFromSale(lines: SaleLineItemDto[]): DocumentLine[] {
  return lines.map((line) => {
    const unitPrice = Number(line.unitPrice);
    const lineGross = unitPrice * line.quantity;
    const discount = Number(line.discountAmount ?? 0);
    const net = lineGross - discount;
    const tax = Number(line.taxAmount);
    const taxRate = net > 0 ? Math.round((tax / net) * 10_000) / 100 : 0;
    return {
      key: line.id,
      name: line.product.name,
      sku: line.product.sku,
      quantity: line.quantity,
      unitPrice,
      taxRate,
      lineGross,
      lineDiscount: Number(line.lineDiscountAmount ?? 0),
      discount,
      net,
      tax,
      gross: Number(line.lineTotal),
    };
  });
}

export function documentTotals(lines: DocumentLine[]): DocumentTotals {
  const rates = new Map<number, { rate: number; net: number; tax: number }>();
  let subtotal = 0;
  let discount = 0;
  let lineDiscounts = 0;
  let net = 0;
  let tax = 0;
  for (const line of lines) {
    subtotal += line.lineGross;
    discount += line.discount;
    lineDiscounts += line.lineDiscount;
    net += line.net;
    tax += line.tax;
    const row = rates.get(line.taxRate) ?? { rate: line.taxRate, net: 0, tax: 0 };
    row.net += line.net;
    row.tax += line.tax;
    rates.set(line.taxRate, row);
  }
  return {
    subtotal,
    discount,
    saleDiscount: discount - lineDiscounts,
    net,
    tax,
    gross: net + tax,
    byRate: [...rates.values()].sort((a, b) => a.rate - b.rate),
  };
}

/** e.g. Q-A1B2-261008-1432: identifies a printed quote; quotes aren't stored. */
export function quoteReference(storeId: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${String(at.getFullYear()).slice(2)}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `Q-${storeId.slice(-4).toUpperCase()}-${stamp}`;
}
