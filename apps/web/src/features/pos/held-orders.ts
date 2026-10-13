import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CustomerDto, DiscountInput } from "@pos/shared";
import type { CartLine } from "./hooks/useCart";
import type { Approval } from "@/features/overrides/approval";

/**
 * Orders put on hold ("Deixar pendente") so the cashier can serve someone
 * else and come back to them. Kept on this till only: nothing is sold yet,
 * so they take no stock and no document number until they're completed.
 */
export interface HeldOrder {
  id: string;
  storeId: string;
  heldAt: string;
  heldBy: { id: string; name: string };
  lines: CartLine[];
  saleDiscount: DiscountInput | null;
  customer: CustomerDto | null;
  /** What the cashier typed to tell it apart, e.g. "Senhora de azul". */
  note: string | null;
  /** Managers' approvals already given for it (discounts, price changes). */
  approvals?: Approval[];
}

/** Oldest ones go when a till keeps more than this. */
export const MAX_HELD_ORDERS = 50;

interface HeldOrdersState {
  orders: HeldOrder[];
  hold: (order: Omit<HeldOrder, "id" | "heldAt">) => HeldOrder;
  /** Removes the order and returns it, to carry on with it. */
  take: (id: string) => HeldOrder | null;
  discard: (id: string) => void;
}

export const useHeldOrders = create<HeldOrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      hold: (order) => {
        const held: HeldOrder = { ...order, id: crypto.randomUUID(), heldAt: new Date().toISOString() };
        set({ orders: [held, ...get().orders].slice(0, MAX_HELD_ORDERS) });
        return held;
      },
      take: (id) => {
        const order = get().orders.find((o) => o.id === id) ?? null;
        if (order) set({ orders: get().orders.filter((o) => o.id !== id) });
        return order;
      },
      discard: (id) => set({ orders: get().orders.filter((o) => o.id !== id) }),
    }),
    { name: "pos-held-orders" },
  ),
);

/** This store's held orders, newest first. */
export function useStoreHeldOrders(storeId: string | null) {
  const orders = useHeldOrders((s) => s.orders);
  return orders.filter((o) => o.storeId === storeId);
}

/** How many items an order has, for the list. */
export function itemCount(order: Pick<HeldOrder, "lines">): number {
  return order.lines.reduce((n, l) => n + l.quantity, 0);
}
