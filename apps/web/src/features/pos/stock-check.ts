import type { ProductDto } from "@pos/shared";

/**
 * Selling beyond the stock the till knows about (tester #32). With current
 * figures from the server and the business not allowing it, the till
 * refuses ("block"); otherwise it only warns: offline or with old figures
 * the sale still goes through, as the goods have already left the shop.
 */
export type StockCheck = { status: "ok" } | { status: "warn" | "block"; available: number };

export interface StockLevels {
  /** Quantity on hand per product (stock products only). */
  byProduct: Map<string, number>;
  /** Fetched from the server just now, not a saved copy. */
  current: boolean;
}

export function checkStock(
  product: Pick<ProductDto, "id" | "trackStock">,
  wanted: number,
  levels: StockLevels | null | undefined,
  allowSellingWithoutStock: boolean,
): StockCheck {
  if (product.trackStock === false || !levels) return { status: "ok" };
  const available = levels.byProduct.get(product.id);
  if (available === undefined || wanted <= available) return { status: "ok" };
  return { status: levels.current && !allowSellingWithoutStock ? "block" : "warn", available };
}

/** Out of stock as far as the till knows (hidden from the grid when the till asks). */
export function isOutOfStock(product: Pick<ProductDto, "id" | "trackStock">, levels: StockLevels | null | undefined): boolean {
  if (product.trackStock === false || !levels) return false;
  const available = levels.byProduct.get(product.id);
  return available !== undefined && available <= 0;
}
