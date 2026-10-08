import type { SaleLineItemDto } from "@pos/shared";
import type { CartLine } from "@/features/pos/hooks/useCart";

/** One row on a quote or invoice. Amounts are numbers in the business currency. */
export interface DocumentLine {
  key: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  /** Percent, e.g. 19. */
  taxRate: number;
  net: number;
  tax: number;
  gross: number;
}

export interface DocumentTotals {
  net: number;
  tax: number;
  gross: number;
  /** One row per tax rate, as invoices usually require. */
  byRate: { rate: number; net: number; tax: number }[];
}

/** Same arithmetic as useCart's totals, so a quote matches the POS screen. */
export function linesFromCart(lines: CartLine[]): DocumentLine[] {
  return lines.map(({ product, quantity }) => {
    const unitPrice = Number(product.sellPrice);
    const taxRate = Number(product.taxRate);
    const net = unitPrice * quantity;
    const tax = (net * taxRate) / 100;
    return { key: product.id, name: product.name, sku: product.sku, quantity, unitPrice, taxRate, net, tax, gross: net + tax };
  });
}

/**
 * From a completed sale. The rate is derived from the stored tax amount, not
 * the product's current rate, which may have changed since the sale.
 */
export function linesFromSale(lines: SaleLineItemDto[]): DocumentLine[] {
  return lines.map((line) => {
    const unitPrice = Number(line.unitPrice);
    const net = unitPrice * line.quantity;
    const tax = Number(line.taxAmount);
    const taxRate = net > 0 ? Math.round((tax / net) * 10_000) / 100 : 0;
    return {
      key: line.id,
      name: line.product.name,
      sku: line.product.sku,
      quantity: line.quantity,
      unitPrice,
      taxRate,
      net,
      tax,
      gross: Number(line.lineTotal),
    };
  });
}

export function documentTotals(lines: DocumentLine[]): DocumentTotals {
  const rates = new Map<number, { rate: number; net: number; tax: number }>();
  let net = 0;
  let tax = 0;
  for (const line of lines) {
    net += line.net;
    tax += line.tax;
    const row = rates.get(line.taxRate) ?? { rate: line.taxRate, net: 0, tax: 0 };
    row.net += line.net;
    row.tax += line.tax;
    rates.set(line.taxRate, row);
  }
  return { net, tax, gross: net + tax, byRate: [...rates.values()].sort((a, b) => a.rate - b.rate) };
}

/** e.g. Q-A1B2-261008-1432: identifies a printed quote; quotes aren't stored. */
export function quoteReference(storeId: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${String(at.getFullYear()).slice(2)}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `Q-${storeId.slice(-4).toUpperCase()}-${stamp}`;
}
