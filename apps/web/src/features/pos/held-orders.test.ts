import { beforeEach, describe, expect, it } from "vitest";
import type { ProductDto } from "@pos/shared";
import { itemCount, MAX_HELD_ORDERS, useHeldOrders } from "./held-orders";

const product = { id: "p1", name: "Pão", sku: "PAO", sellPrice: "100.00", taxRate: "14.00" } as ProductDto;
const by = { id: "u1", name: "Ana Caixa" };

function hold(storeId = "s1", quantity = 2) {
  return useHeldOrders.getState().hold({
    storeId,
    heldBy: by,
    lines: [{ product, quantity }],
    saleDiscount: null,
    customer: null,
    note: null,
  });
}

describe("held orders", () => {
  beforeEach(() => useHeldOrders.setState({ orders: [] }));

  it("holds an order and gives it back exactly once", () => {
    const held = hold();
    expect(useHeldOrders.getState().orders).toHaveLength(1);
    const taken = useHeldOrders.getState().take(held.id);
    expect(taken?.lines[0].quantity).toBe(2);
    expect(useHeldOrders.getState().orders).toHaveLength(0);
    expect(useHeldOrders.getState().take(held.id)).toBeNull();
  });

  it("lists newest first and can discard one", () => {
    const first = hold();
    const second = hold();
    expect(useHeldOrders.getState().orders.map((o) => o.id)).toEqual([second.id, first.id]);
    useHeldOrders.getState().discard(first.id);
    expect(useHeldOrders.getState().orders.map((o) => o.id)).toEqual([second.id]);
  });

  it("keeps at most the limit, dropping the oldest", () => {
    const oldest = hold();
    for (let i = 0; i < MAX_HELD_ORDERS; i++) hold();
    const ids = useHeldOrders.getState().orders.map((o) => o.id);
    expect(ids).toHaveLength(MAX_HELD_ORDERS);
    expect(ids).not.toContain(oldest.id);
  });

  it("counts items", () => {
    expect(itemCount({ lines: [{ product, quantity: 2 }, { product, quantity: 3 }] })).toBe(5);
  });
});
