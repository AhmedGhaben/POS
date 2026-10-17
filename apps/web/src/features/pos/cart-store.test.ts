import { beforeEach, describe, expect, it } from "vitest";
import type { CustomerDto, ProductDto, UserDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { cartKey, currentCartKey, hasOpenCart, useCartStore } from "./cart-store";

const bread = { id: "p1", name: "Pão", sellPrice: "150", taxRate: "0", exemptionCode: "M10", unit: "un" } as unknown as ProductDto;
const customer = { id: "c1", name: "Maria" } as CustomerDto;

function signIn(userId: string) {
  useAuthStore.setState({ user: { id: userId } as UserDto, currentStoreId: "s1" });
}

describe("the till's saved cart (docs/DECISIONS.md, POS cart)", () => {
  beforeEach(() => {
    useCartStore.setState({ carts: {} });
    localStorage.clear();
    signIn("ana");
  });

  it("keeps items, discounts, the customer and what was typed", () => {
    const key = currentCartKey()!;
    useCartStore.getState().update(key, () => ({
      lines: [{ product: bread, quantity: 3, discount: { type: "PERCENT", value: 10 } }],
      saleDiscount: { type: "AMOUNT", value: 50 },
      customer,
      receiptEmail: "maria@example.com",
      payment: { isSplit: false, method: "CASH" as never, tendered: "1000", rows: [] },
    }));
    const cart = useCartStore.getState().carts[key];
    expect(cart.lines[0].quantity).toBe(3);
    expect(cart.saleDiscount).toEqual({ type: "AMOUNT", value: 50 });
    expect(cart.customer?.name).toBe("Maria");
    expect(cart.payment?.tendered).toBe("1000");
    expect(hasOpenCart()).toBe(true);
  });

  it("is still there after a restart (saved on the till at every change)", async () => {
    const key = currentCartKey()!;
    useCartStore.getState().update(key, () => ({ lines: [{ product: bread, quantity: 2 }], customer }));
    // The app closes: what's in memory is gone, what's saved on the till stays.
    const saved = localStorage.getItem("pos-cart");
    expect(saved).toContain("Maria");
    useCartStore.setState({ carts: {} });
    localStorage.setItem("pos-cart", saved!);
    await useCartStore.persist.rehydrate();
    expect(useCartStore.getState().carts[key].lines[0].quantity).toBe(2);
    expect(useCartStore.getState().carts[key].customer?.id).toBe("c1");
  });

  it("goes once cleared (sale completed, cancelled or held)", () => {
    const key = currentCartKey()!;
    useCartStore.getState().update(key, () => ({ lines: [{ product: bread, quantity: 1 }] }));
    useCartStore.getState().clear(key);
    expect(useCartStore.getState().carts[key]).toBeUndefined();
    expect(hasOpenCart()).toBe(false);
  });

  it("someone else signing in on the same till gets their own cart, not the last person's", () => {
    useCartStore.getState().update(currentCartKey()!, () => ({ lines: [{ product: bread, quantity: 4 }], customer }));
    signIn("bruno");
    expect(hasOpenCart()).toBe(false);
    expect(useCartStore.getState().carts[currentCartKey()!]).toBeUndefined();
    // Ana's is untouched for when she's back.
    signIn("ana");
    expect(useCartStore.getState().carts[currentCartKey()!].lines[0].quantity).toBe(4);
  });

  it("one per till, store and person", () => {
    expect(cartKey("till-1", "s1", "ana")).not.toBe(cartKey("till-2", "s1", "ana"));
    expect(cartKey("till-1", "s1", "ana")).not.toBe(cartKey("till-1", "s2", "ana"));
    expect(cartKey("till-1", "s1", null)).toBeNull();
  });
});
