import { create } from "zustand";

/** What the cashier was doing when the till stopped them: a sale is still in the cart. */
export type CartGuardNext = "logout" | "closeShift";

/**
 * Logging out or closing the shift with items in the cart asks first:
 * "Deixar pendente" (park it as a held order) or cancel the sale. The POS
 * page shows the question (docs/DECISIONS.md, "POS cart").
 */
interface CartGuardState {
  pending: CartGuardNext | null;
  ask: (next: CartGuardNext) => void;
  done: () => void;
}

export const useCartGuard = create<CartGuardState>((set) => ({
  pending: null,
  ask: (next) => set({ pending: next }),
  done: () => set({ pending: null }),
}));

/** Set when someone leaves the sale screen, so the page they went to offers "Voltar ao POS". */
export const useLeftPos = create<{ left: boolean }>(() => ({ left: false }));
