import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { syncOutbox } from "@/features/pos/sync";

/**
 * Connectivity and sync status for the cashier: "Working offline — 4 sales
 * waiting to sync", "Syncing 4 sales…", failures. Sync itself runs in the
 * background (startSyncEngine); "Retry sync" just runs it now.
 */
export function OfflineIndicator() {
  const internet = useOfflineStore((s) => s.internet);
  const server = useOfflineStore((s) => s.server);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const failedCount = useOfflineStore((s) => s.failedCount);
  const isSyncing = useOfflineStore((s) => s.isSyncing);
  const offline = isWorkingOffline({ internet, server });
  const { t } = useTranslation("pos");

  async function retry() {
    const { synced, failed, interrupted } = await syncOutbox();
    if (synced > 0) toast.success(t("sync.synced", { count: synced }));
    if (failed > 0) toast.error(t("sync.failedReview", { count: failed }));
    if (interrupted) toast.error(t("sync.unreachable"));
  }

  if (!offline && pendingCount === 0 && failedCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div className="flex items-center gap-2" data-testid="sync-status">
      {offline && (
        <Badge variant="destructive" className="gap-1" title={internet ? t("sync.serverDown") : t("sync.noInternet")}>
          <CloudOff className="h-3 w-3" />
          {pendingCount > 0 ? t("sync.offlineWaiting", { count: pendingCount }) : t("sync.offline")}
        </Badge>
      )}
      {!offline && isSyncing && pendingCount > 0 && (
        <Badge variant="secondary" className="gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" /> {t("sync.syncing", { count: pendingCount })}
        </Badge>
      )}
      {failedCount > 0 && (
        <Link to="/device" className={badgeVariants({ variant: "destructive", className: "gap-1" })}>
          <AlertTriangle className="h-3 w-3" /> {t("sync.failed", { count: failedCount })}
        </Link>
      )}
      {pendingCount > 0 && (
        <Button variant="outline" size="sm" disabled={isSyncing} onClick={retry} className="gap-1">
          <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
          {t("sync.retry")}
        </Button>
      )}
    </div>
  );
}
