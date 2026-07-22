import * as React from "react";
import { toast } from "sonner";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOfflineStore } from "@/features/pos/offline-store";
import { syncPendingSales } from "@/features/pos/sync";

/** Shows an "Offline" badge while disconnected and a pending-sale count with
 * a manual "Sync now" fallback — auto-syncs on the browser's `online` event,
 * but that event isn't always reliable, so a manual retry stays available. */
export function OfflineIndicator() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const isSyncing = useOfflineStore((s) => s.isSyncing);
  const setOnline = useOfflineStore((s) => s.setOnline);
  const setSyncing = useOfflineStore((s) => s.setSyncing);
  const refreshPendingCount = useOfflineStore((s) => s.refreshPendingCount);

  const runSync = React.useCallback(async () => {
    setSyncing(true);
    try {
      const { synced, failed } = await syncPendingSales();
      if (synced > 0) {
        toast.success(`Synced ${synced} offline sale${synced === 1 ? "" : "s"}`);
      }
      if (failed > 0) {
        toast.error(
          `${failed} offline sale${failed === 1 ? "" : "s"} failed to sync — needs review`,
        );
      }
    } finally {
      setSyncing(false);
      await refreshPendingCount();
    }
  }, [setSyncing, refreshPendingCount]);

  React.useEffect(() => {
    refreshPendingCount();

    function handleOnline() {
      setOnline(true);
      runSync();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {!isOnline && (
        <Badge variant="destructive" className="gap-1">
          <WifiOff className="h-3 w-3" /> Offline
        </Badge>
      )}
      {pendingCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          disabled={!isOnline || isSyncing}
          onClick={runSync}
          className="gap-1"
        >
          <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : `${pendingCount} pending`}
        </Button>
      )}
    </div>
  );
}
