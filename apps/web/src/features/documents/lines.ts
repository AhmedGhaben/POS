import type { DiscountInput, SaleLineItemDto } from "@pos/shared";
import { currentTaxContext, linePrice, priceCart, productTax, type CartLine, type TaxContext } from "@/features/pos/hooks/useCart";

/**
 * One row on a quote or invoice. Amounts are numbers in the business
 * currency, without tax: when the shop's prices include IVA they're worked
 * out of them (decision 6), so net + tax is still what the customer pays.
 */
export interface DocumentLine {
  key: string;
  name: string;
  sku: string | null;
  quantity: number;
  /** un, kg... */
  unit: string;
  /** Per unit, without tax. */
  unitPrice: number;
  /** Per unit as priced on the shelf: with tax when the store's prices include it. */
  shelfPrice: number;
  /** Percent, e.g. 14. */
  taxRate: number;
  /** Why it's exempt (M10...) when the rate is 0. */
  exemptionCode: string | null;
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

const round2 = (n: number) => Math.round(n * 100) / 100;

interface PricedRow {
  key: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  taxRate: number;
  exemptionCode: string | null;
  /** As priced: with tax when prices include it. */
  unitPrice: number;
  gross: number;
  lineDiscount: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
}

/**
 * A line on a document. With prices that include tax, the discounts and the
 * unit price are shown without it, in proportion to the line's base, so
 * the columns add up to the base the tax was charged on.
 */
export function documentLine(row: PricedRow, taxIncluded: boolean): DocumentLine {
  const common = { key: row.key, name: row.name, sku: row.sku, quantity: row.quantity, unit: row.unit, taxRate: row.taxRate, exemptionCode: row.exemptionCode, shelfPrice: row.unitPrice };
  if (!taxIncluded) {
    return { ...common, unitPrice: row.unitPrice, lineGross: row.gross, lineDiscount: row.lineDiscount, discount: row.discount, net: row.net, tax: row.tax, gross: row.total };
  }
  const paid = row.gross - row.discount;
  const ratio = paid > 0 ? row.net / paid : 100 / (100 + row.taxRate);
  const discount = round2(row.discount * ratio);
  const lineGross = round2(row.net + discount);
  return {
    ...common,
    unitPrice: row.quantity > 0 ? lineGross / row.quantity : 0,
    lineGross,
    lineDiscount: Math.min(discount, round2(row.lineDiscount * ratio)),
    discount,
    net: row.net,
    tax: row.tax,
    gross: row.total,
  };
}

/** Same pricing as the POS screen and the server, so a quote matches the till. */
export function linesFromCart(lines: CartLine[], saleDiscount: DiscountInput | null = null, ctx: TaxContext = currentTaxContext()): DocumentLine[] {
  const priced = priceCart(lines, saleDiscount, ctx);
  return lines.map((line, i) => {
    const p = priced.lines[i];
    const tax = productTax(line.product, ctx);
    return documentLine(
      {
        key: line.product.id,
        name: line.product.name,
        sku: line.product.sku,
        quantity: line.quantity,
        unit: line.product.unit ?? "un",
        taxRate: tax.rate,
        exemptionCode: tax.exemptionCode,
        unitPrice: linePrice(line),
        gross: p.gross,
        lineDiscount: p.lineDiscount,
        discount: p.discount,
        net: p.net,
        tax: p.tax,
        total: p.total,
      },
      priced.taxIncluded,
    );
  });
}

/**
 * From a completed sale. The rate is the one recorded on the line; older
 * sales didn't record it, so it's worked out from the tax amount (not the
 * product's current rate, which may have changed since).
 */
export function linesFromSale(lines: SaleLineItemDto[], taxIncluded = false): DocumentLine[] {
  return lines.map((line) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const total = Number(line.lineTotal);
    const tax = Number(line.taxAmount);
    const net = round2(total - tax);
    const taxRate =
      line.taxRate !== undefined && line.taxRate !== null ? Number(line.taxRate) : net > 0 ? Math.round((tax / net) * 10_000) / 100 : 0;
    return documentLine(
      {
        key: line.id,
        name: line.product.name,
        sku: line.product.sku,
        quantity,
        unit: line.unit ?? "un",
        taxRate,
        exemptionCode: line.exemptionCode ?? null,
        unitPrice,
        gross: round2(unitPrice * quantity),
        lineDiscount: Number(line.lineDiscountAmount ?? 0),
        discount: Number(line.discountAmount ?? 0),
        net,
        tax,
        total,
      },
      taxIncluded,
    );
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
