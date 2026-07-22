import { apiClient, ApiError } from "@/lib/api-client";
import { listPendingSales, markPendingSaleFailed, removePendingSale } from "@/lib/offline-db";

export interface SyncResult {
  synced: number;
  failed: number;
}

/**
 * Drains the offline sale queue in creation order. A rejected sale (e.g. the
 * server now says stock ran out) is marked failed and left for a manager to
 * review rather than retried forever; a network failure stops the drain here
 * so remaining sales don't get reordered ahead of one still stuck retrying.
 */
export async function syncPendingSales(): Promise<SyncResult> {
  const pending = await listPendingSales();
  let synced = 0;
  let failed = 0;

  for (const sale of pending) {
    if (sale.status === "failed") {
      continue;
    }
    try {
      await apiClient.post("/sales", sale.dto);
      await removePendingSale(sale.localId);
      synced++;
    } catch (err) {
      if (err instanceof ApiError) {
        await markPendingSaleFailed(sale.localId, err.message);
        failed++;
        continue;
      }
      break;
    }
  }

  return { synced, failed };
}
