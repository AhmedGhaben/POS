import { create } from "zustand";
import { persist } from "zustand/middleware";
import { outboxCounts } from "@/lib/offline-db";

export type ServerState = "unknown" | "up" | "down";

/**
 * Connectivity and sync status. Internet and server are tracked separately:
 * having internet doesn't mean the POS server is reachable.
 */
interface OfflineState {
  internet: boolean;
  server: ServerState;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  setInternet: (online: boolean) => void;
  setServer: (state: ServerState) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSyncAt: (at: string) => void;
  refreshPendingCount: () => Promise<void>;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      // No `navigator` outside a browser (e.g. unit tests on Node 20).
      internet: typeof navigator === "undefined" ? true : navigator.onLine,
      server: "unknown",
      pendingCount: 0,
      failedCount: 0,
      isSyncing: false,
      lastSyncAt: null,
      setInternet: (internet) => set({ internet }),
      setServer: (server) => set({ server }),
      setSyncing: (isSyncing) => set({ isSyncing }),
      setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
      refreshPendingCount: async () => {
        const counts = await outboxCounts();
        set({ pendingCount: counts.pending + counts.syncing, failedCount: counts.failed });
      },
    }),
    { name: "pos-sync", partialize: (s) => ({ lastSyncAt: s.lastSyncAt }) },
  ),
);

/** Selling should go straight to the local queue instead of waiting on a request. */
export function isWorkingOffline(state: Pick<OfflineState, "internet" | "server"> = useOfflineStore.getState()) {
  return !state.internet || state.server === "down";
}
