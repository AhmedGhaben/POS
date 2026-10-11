import * as React from "react";
import { priceSale, type DiscountInput, type PricedSale, type PricingLineInput, type ProductDto } from "@pos/shared";

export interface CartLine {
  product: ProductDto;
  quantity: number;
  /** Off this line. */
  discount?: DiscountInput | null;
}

export function pricingInput(lines: CartLine[]): PricingLineInput[] {
  return lines.map((l) => ({
    unitPrice: Number(l.product.sellPrice),
    quantity: l.quantity,
    taxRate: Number(l.product.taxRate),
    discount: l.discount ?? null,
  }));
}

/** What the cart comes to, worked out exactly as the server will. */
export function priceCart(lines: CartLine[], saleDiscount: DiscountInput | null): PricedSale {
  return priceSale(pricingInput(lines), saleDiscount);
}

export function useCart() {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [saleDiscount, setSaleDiscount] = React.useState<DiscountInput | null>(null);

  const addProduct = React.useCallback((product: ProductDto) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
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

  const removeLine = React.useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = React.useCallback(() => {
    setLines([]);
    setSaleDiscount(null);
  }, []);

  const priced = React.useMemo(() => priceCart(lines, saleDiscount), [lines, saleDiscount]);
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
    removeLine,
    clear,
    totals,
  };
}
