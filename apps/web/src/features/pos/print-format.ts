import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PrintFormat } from "@/components/print/PrintArea";

/**
 * How this till prints a sale: the thermal receipt or the A4 document
 * (tester #35). Chosen with the Receipt / A4 toggle after a sale and kept
 * on this device, per store. Until someone chooses, the store's setting
 * (Settings → Stores) applies.
 */
interface PrintFormatState {
  byStore: Record<string, PrintFormat>;
  setFormat: (storeId: string, format: PrintFormat) => void;
}

export const usePrintFormatStore = create<PrintFormatState>()(
  persist(
    (set) => ({
      byStore: {},
      setFormat: (storeId, format) => set((s) => ({ byStore: { ...s.byStore, [storeId]: format } })),
    }),
    { name: "pos-print-format" },
  ),
);

/** This till's choice for the store, else the store's own setting. */
export function salePrintFormat(chosen: PrintFormat | undefined, storeSetting: "RECEIPT" | "A4" | undefined): PrintFormat {
  return chosen ?? (storeSetting === "A4" ? "a4" : "receipt");
}

export function useSalePrintFormat(storeId: string | undefined, storeSetting: "RECEIPT" | "A4" | undefined): PrintFormat {
  const chosen = usePrintFormatStore((s) => (storeId ? s.byStore[storeId] : undefined));
  return salePrintFormat(chosen, storeSetting);
}
