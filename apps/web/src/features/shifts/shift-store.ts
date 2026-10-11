import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SaleDto } from "@pos/shared";
import { ledgerSale, type LedgerMovement, type LocalShift } from "./ledger";

/**
 * This device's open shift, kept on the device (localStorage) so the till
 * knows it's open and what's in it while offline. One at a time.
 */
interface ShiftState {
  current: LocalShift | null;
  /**
   * Shifts this device closed. The server may still show one as open until
   * the close uploads; it must not be picked up again meanwhile.
   */
  closedIds: string[];
  setCurrent: (shift: LocalShift | null) => void;
  markClosed: (clientId: string) => void;
  recordSale: (sale: SaleDto, cashierName: string) => void;
  recordVoid: (saleKey: string) => void;
  recordMovement: (movement: LedgerMovement) => void;
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      current: null,
      closedIds: [],
      setCurrent: (current) => set({ current }),
      markClosed: (clientId) => set({ current: null, closedIds: [clientId, ...get().closedIds].slice(0, 20) }),
      recordSale: (sale, cashierName) => {
        const current = get().current;
        if (!current || current.storeId !== sale.storeId) return;
        const entry = ledgerSale(sale, cashierName);
        set({ current: { ...current, sales: [...current.sales.filter((s) => s.key !== entry.key), entry] } });
      },
      recordVoid: (saleKey) => {
        const current = get().current;
        if (!current) return;
        set({ current: { ...current, sales: current.sales.map((s) => (s.key === saleKey ? { ...s, voided: true } : s)) } });
      },
      recordMovement: (movement) => {
        const current = get().current;
        if (!current) return;
        set({ current: { ...current, movements: [...current.movements, movement] } });
      },
    }),
    { name: "pos-shift" },
  ),
);

/** The open shift for this store on this device, if any. */
export function useCurrentShift(storeId: string | null) {
  return useShiftStore((s) => (s.current && s.current.storeId === storeId ? s.current : null));
}
