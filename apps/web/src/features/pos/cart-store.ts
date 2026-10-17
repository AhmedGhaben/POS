import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CustomerDto, DiscountInput, PaymentMethod, Permission } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { useDeviceStore } from "@/features/desktop/bridge";
import type { Approval } from "@/features/overrides/approval";
import type { CartLine } from "./hooks/useCart";
import { NO_CREDIT, type CreditChoice } from "./credit";

/** What the cashier set in the payment panel, kept with the sale. */
export interface PaymentDraft {
  isSplit: boolean;
  method: PaymentMethod;
  /** Cash handed over, as typed. */
  tendered: string;
  rows: { id: number; method: PaymentMethod; amount: string }[];
}

/**
 * The sale being rung up, exactly as the cashier left it: items,
 * quantities, discounts, prices changed, the customer and anything typed.
 * Saved on this till at every change, so it survives going to another
 * page, closing the app or a crash. It goes when the sale is completed,
 * cancelled ("Limpar"), or parked as a held order ("Deixar pendente").
 */
export interface CartDraft {
  lines: CartLine[];
  saleDiscount: DiscountInput | null;
  customer: CustomerDto | null;
  receiptEmail: string;
  credit: CreditChoice;
  /** Managers' approvals already given for this sale, one per permission. */
  approvals: Partial<Record<Permission, Approval>>;
  payment: PaymentDraft | null;
  /** A Factura Pró-forma being sold. */
  proforma: { id: string; documentNo: string } | null;
  updatedAt: string;
}

export const EMPTY_CART: Omit<CartDraft, "updatedAt"> = {
  lines: [],
  saleDiscount: null,
  customer: null,
  receiptEmail: "",
  credit: NO_CREDIT,
  approvals: {},
  payment: null,
  proforma: null,
};

/**
 * One cart per till, store and person: whoever signs in next on this till
 * (PIN or password) gets their own, never the last person's. Theirs is
 * still there when they come back.
 */
export function cartKey(terminalId: string | null | undefined, storeId: string | null | undefined, userId: string | null | undefined): string | null {
  return storeId && userId ? `${terminalId ?? "browser"}|${storeId}|${userId}` : null;
}

/** The cart key for whoever is signed in here now. */
export function currentCartKey(): string | null {
  const { currentStoreId, user } = useAuthStore.getState();
  return cartKey(useDeviceStore.getState().terminal?.id, currentStoreId, user?.id);
}

export function useCartKey(): string | null {
  const storeId = useAuthStore((s) => s.currentStoreId);
  const userId = useAuthStore((s) => s.user?.id);
  const terminalId = useDeviceStore((s) => s.terminal?.id);
  return cartKey(terminalId, storeId, userId);
}

interface CartState {
  carts: Record<string, CartDraft>;
  /** Changes one cart; an empty one is dropped. */
  update: (key: string, change: (cart: Omit<CartDraft, "updatedAt">) => Partial<CartDraft>) => void;
  clear: (key: string) => void;
}

function isEmpty(cart: Omit<CartDraft, "updatedAt">): boolean {
  return cart.lines.length === 0 && !cart.customer && !cart.receiptEmail && !cart.proforma && !cart.saleDiscount;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      update: (key, change) =>
        set((state) => {
          const current = state.carts[key] ?? EMPTY_CART;
          const next = { ...current, ...change(current), updatedAt: new Date().toISOString() };
          const carts = { ...state.carts };
          if (isEmpty(next)) delete carts[key];
          else carts[key] = next;
          return { carts };
        }),
      clear: (key) =>
        set((state) => {
          if (!(key in state.carts)) return state;
          const carts = { ...state.carts };
          delete carts[key];
          return { carts };
        }),
    }),
    { name: "pos-cart", version: 1 },
  ),
);

/** The signed-in person's cart here, or the empty one. */
export function useCartDraft(key: string | null): Omit<CartDraft, "updatedAt"> {
  return useCartStore((s) => (key && s.carts[key]) || EMPTY_CART);
}

/** Has the person signed in here a sale in progress (items in the cart)? */
export function hasOpenCart(): boolean {
  const key = currentCartKey();
  return !!key && (useCartStore.getState().carts[key]?.lines.length ?? 0) > 0;
}
