import { create } from "zustand";
import { listPendingSales } from "@/lib/offline-db";

interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  refreshPendingCount: () => Promise<void>;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: navigator.onLine,
  pendingCount: 0,
  isSyncing: false,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  refreshPendingCount: async () => {
    const pending = await listPendingSales();
    set({ pendingCount: pending.length });
  },
}));
