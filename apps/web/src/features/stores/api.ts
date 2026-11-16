import { useQuery } from "@tanstack/react-query";
import type { StoreStatusDto } from "@pos/shared";
import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth/store";

export const STORES_STATUS_KEY = ["stores-status"] as const;
/** While the dashboard is visible; React Query pauses it in a hidden tab. */
export const STORES_STATUS_REFRESH_MS = 30_000;

export function fetchStoresStatus(): Promise<StoreStatusDto[]> {
  return apiClient.get<StoreStatusDto[]>("/stores/status", { timeoutMs: 10_000 });
}

/** Owners and managers read it (the server checks too). */
export function canSeeStoresStatus(role: string | undefined): boolean {
  return role === "OWNER" || role === "MANAGER";
}

/** "Lojas agora": every store this person can see, refreshed every 30 s. */
export function useStoresStatus() {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: STORES_STATUS_KEY,
    queryFn: fetchStoresStatus,
    enabled: canSeeStoresStatus(role),
    refetchInterval: STORES_STATUS_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/** Which store's tills are open in the details drawer (the panel and the banner open it). */
export const useStoreDetails = create<{ storeId: string | null; open: (storeId: string | null) => void }>((set) => ({
  storeId: null,
  open: (storeId) => set({ storeId }),
}));
