import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusDiamond } from "@/components/ui/status-diamond";
import { refusedEntriesPath } from "@/features/pos/refused-link";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { syncOutbox } from "@/features/pos/sync";

/**
 * Connectivity and sync status for the cashier: "Sem internet · a vender ·
 * 4 vendas por enviar", "A sincronizar 4 vendas…", failures. Sync itself runs in the
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
  const { t: tc } = useTranslation();

  async function retry() {
    const { synced, failed, interrupted } = await syncOutbox();
    if (synced > 0) toast.success(t("sync.synced", { count: synced }));
    if (failed > 0) toast.error(t("sync.failedReview", { count: failed }));
    if (interrupted) toast.error(t("sync.unreachable"));
  }

  // All up to date: a quiet green "Online" (outside the sync-status box, which only shows work to do).
  if (!offline && pendingCount === 0 && failedCount === 0 && !isSyncing) {
    return <StatusDiamond state="online" className="h-8 px-1 text-xs font-semibold" data-testid="connection-online" />;
  }

  // Looks only: the states are the same as before, drawn with StatusDiamond.
  return (
    <div className="flex items-center gap-2" data-testid="sync-status">
      {offline && (
        <StatusDiamond
          state="offline"
          className="sb-offline h-8 px-2.5 text-xs font-semibold"
          title={internet ? t("sync.serverDown") : t("sync.noInternet")}
          label={pendingCount > 0 ? t("sync.offlineWaiting", { count: pendingCount }) : t("sync.offline")}
        />
      )}
      {!offline && isSyncing && pendingCount > 0 && (
        <StatusDiamond
          state="syncing"
          className="h-8 rounded-xl border bg-card px-2.5 text-xs font-semibold"
          label={t("sync.syncing", { count: pendingCount })}
        />
      )}
      {failedCount > 0 && (
        <Link to={refusedEntriesPath()} className="sb-error inline-flex h-8 items-center px-2.5 text-xs font-semibold hover:underline">
          <StatusDiamond state="error" label={`${tc("connection.error")} · ${t("sync.failed", { count: failedCount })}`} />
        </Link>
      )}
      {pendingCount > 0 && (
        <Button variant="outline" size="sm" disabled={isSyncing} onClick={retry} className="gap-1">
          <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} aria-hidden />
          {t("sync.retry")}
        </Button>
      )}
    </div>
  );
}
