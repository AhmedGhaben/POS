import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { apiClient, isUnreachableError } from "@/lib/api-client";
import { loadCatalog, saveCatalog } from "@/lib/offline-db";
import { isWorkingOffline, useOfflineStore } from "./offline-store";
import { stockForConnection } from "./stock-check";
import type { StockLevels } from "./stock-check";

type LevelRow = { productId: string; quantity: string };

function key(storeId: string) {
  const businessId = useAuthStore.getState().user?.businessId ?? "none";
  return `${businessId}:stock:${storeId}`;
}

function toLevels(rows: LevelRow[], current: boolean): StockLevels {
  return { byProduct: new Map(rows.map((r) => [r.productId, Number(r.quantity)])), current };
}

/**
 * The stock the till knows about, for warnings before checkout. From the
 * server when it answers (current), else the copy saved last time (only
 * ever warns). Under ["inventory", storeId] so a sale refreshes it.
 */
export async function fetchStockLevels(storeId: string): Promise<StockLevels | null> {
  const saved = async () => {
    const copy = await loadCatalog<LevelRow[]>(key(storeId));
    return copy ? toLevels(copy.data, false) : null;
  };
  if (isWorkingOffline()) return saved();
  const connectionEpoch = useOfflineStore.getState().connectionEpoch;
  try {
    const rows = await apiClient.get<LevelRow[]>(`/stores/${storeId}/inventory/levels`);
    await saveCatalog(key(storeId), rows);
    return { ...toLevels(rows, true), connectionEpoch };
  } catch (err) {
    if (isUnreachableError(err)) return saved();
    throw err;
  }
}

export function useStockLevels(storeId: string | null | undefined) {
  const online = useOfflineStore((s) => !isWorkingOffline(s));
  const connectionEpoch = useOfflineStore((s) => s.connectionEpoch);
  const query = useQuery({
    queryKey: ["inventory", storeId, "levels"],
    queryFn: () => fetchStockLevels(storeId!),
    enabled: !!storeId,
    // Older than this, the figures may be off: the till only warns.
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const { refetch } = query;
  useEffect(() => {
    // A health check can restore connectivity without refreshing this query.
    // Fetch immediately rather than trusting a fresh-looking pre-outage cache.
    if (online && storeId) void refetch();
  }, [online, connectionEpoch, storeId, refetch]);
  return { ...query, data: stockForConnection(query.data, query.dataUpdatedAt, online, connectionEpoch) };
}
