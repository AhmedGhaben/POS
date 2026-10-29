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
  /** Invalidates stock fetched before a connectivity loss; never persisted. */
  connectionEpoch: number;
  pendingCount: number;
  failedCount: number;
  /** Drawer openings waiting to upload (they sync with the sales). */
  pendingDrawerCount: number;
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
      connectionEpoch: 0,
      pendingCount: 0,
      failedCount: 0,
      pendingDrawerCount: 0,
      isSyncing: false,
      lastSyncAt: null,
      setInternet: (internet) => set((s) => ({ internet, connectionEpoch: s.connectionEpoch + (s.internet && !internet ? 1 : 0) })),
      setServer: (server) => set((s) => ({ server, connectionEpoch: s.connectionEpoch + (s.server !== "down" && server === "down" ? 1 : 0) })),
      setSyncing: (isSyncing) => set({ isSyncing }),
      setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
      refreshPendingCount: async () => {
        const all = await outboxCounts();
        const sales = await outboxCounts("sale");
        const drawer = await outboxCounts("drawer-event");
        set({
          pendingCount: sales.pending + sales.syncing,
          // Anything refused, whatever its kind, needs a manager's look.
          failedCount: all.failed,
          pendingDrawerCount: drawer.pending + drawer.syncing,
        });
      },
    }),
    { name: "pos-sync", partialize: (s) => ({ lastSyncAt: s.lastSyncAt }) },
  ),
);

/** Selling should go straight to the local queue instead of waiting on a request. */
export function isWorkingOffline(state: Pick<OfflineState, "internet" | "server"> = useOfflineStore.getState()) {
  return !state.internet || state.server === "down";
}
