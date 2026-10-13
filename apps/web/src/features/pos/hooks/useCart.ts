import * as React from "react";
import {
  countryConfig,
  lineTax,
  priceSale,
  roundQuantity,
  type DiscountInput,
  type IvaRegime,
  type LineTax,
  type PricedSale,
  type PricingLineInput,
  type ProductDto,
  type StoreDto,
} from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";

/** What the store's settings say about tax: prices with or without it, and its regime. */
export interface TaxContext {
  taxIncluded: boolean;
  country: string | null;
  regime: IvaRegime | null;
}

/** A store's tax settings (sessions saved before they existed price without tax, as before). */
export function taxContextFor(store: Pick<StoreDto, "pricesIncludeTax" | "country" | "ivaRegime"> | null | undefined): TaxContext {
  return { taxIncluded: !!store?.pricesIncludeTax, country: store?.country ?? null, regime: store?.ivaRegime ?? null };
}

/** The store the till is selling in. */
export function currentTaxContext(): TaxContext {
  const { stores, currentStoreId } = useAuthStore.getState();
  return taxContextFor(stores.find((s) => s.id === currentStoreId));
}

/** The tax on one product sold here: its own, or exempt under the store's regime. */
export function productTax(product: ProductDto, ctx: TaxContext): LineTax {
  return lineTax(countryConfig(ctx.country), ctx.regime, product);
}

export interface CartLine {
  product: ProductDto;
  quantity: number;
  /** Off this line. */
  discount?: DiscountInput | null;
  /** A price the cashier changed at the till (CHANGE_PRICE or a manager's approval). */
  unitPrice?: number | null;
}

/** What one of this line costs: the changed price, or the product's. */
export function linePrice(line: Pick<CartLine, "product" | "unitPrice">): number {
  return line.unitPrice ?? Number(line.product.sellPrice);
}

export function pricingInput(lines: CartLine[], ctx: TaxContext = currentTaxContext()): PricingLineInput[] {
  return lines.map((l) => ({
    unitPrice: linePrice(l),
    quantity: l.quantity,
    taxRate: productTax(l.product, ctx).rate,
    discount: l.discount ?? null,
  }));
}

/** What the cart comes to, worked out exactly as the server will. */
export function priceCart(lines: CartLine[], saleDiscount: DiscountInput | null, ctx: TaxContext = currentTaxContext()): PricedSale {
  return priceSale(pricingInput(lines, ctx), saleDiscount, { taxIncluded: ctx.taxIncluded });
}

export function useCart() {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [saleDiscount, setSaleDiscount] = React.useState<DiscountInput | null>(null);
  // Re-price when the store (or its tax settings) changes.
  const store = useAuthStore((s) => s.stores.find((x) => x.id === s.currentStoreId));
  const ctx = React.useMemo(() => taxContextFor(store), [store]);

  const addProduct = React.useCallback((product: ProductDto, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: roundQuantity(l.quantity + quantity, product.unit) } : l,
        );
      }
      return [...prev, { product, quantity }];
    });
  }, []);

  /** Puts back a cart that was put on hold. */
  const restore = React.useCallback((restored: CartLine[], discount: DiscountInput | null) => {
    setLines(restored);
    setSaleDiscount(discount);
  }, []);

  const setQuantity = React.useCallback((productId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    );
  }, []);

  const setLineDiscount = React.useCallback((productId: string, discount: DiscountInput | null) => {
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, discount } : l)));
  }, []);

  /** null puts the product's own price back. */
  const setLinePrice = React.useCallback((productId: string, unitPrice: number | null) => {
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, unitPrice } : l)));
  }, []);

  const removeLine = React.useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = React.useCallback(() => {
    setLines([]);
    setSaleDiscount(null);
  }, []);

  const priced = React.useMemo(() => priceCart(lines, saleDiscount, ctx), [lines, saleDiscount, ctx]);
  const totals = React.useMemo(
    () => ({
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      saleDiscount: priced.saleDiscount,
      taxTotal: priced.taxTotal,
      total: priced.total,
    }),
    [priced],
  );

  return {
    lines,
    priced,
    saleDiscount,
    addProduct,
    setQuantity,
    setLineDiscount,
    setSaleDiscount,
    setLinePrice,
    removeLine,
    clear,
    restore,
    totals,
  };
}
