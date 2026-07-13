import * as React from "react";
import type { ProductDto } from "@pos/shared";

export interface CartLine {
  product: ProductDto;
  quantity: number;
}

export function useCart() {
  const [lines, setLines] = React.useState<CartLine[]>([]);

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

  const removeLine = React.useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = React.useCallback(() => setLines([]), []);

  const totals = React.useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of lines) {
      const lineSubtotal = Number(line.product.sellPrice) * line.quantity;
      const lineTax = (lineSubtotal * Number(line.product.taxRate)) / 100;
      subtotal += lineSubtotal;
      taxTotal += lineTax;
    }
    return { subtotal, taxTotal, total: subtotal + taxTotal };
  }, [lines]);

  return { lines, addProduct, setQuantity, removeLine, clear, totals };
}
