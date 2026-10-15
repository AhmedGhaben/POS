import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ban, Printer } from "lucide-react";
import { SaleStatus, type SaleDto, type StoreDto } from "@pos/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PrintArea } from "@/components/print/PrintArea";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { printDocument } from "@/features/desktop/printing";
import { PrintButton } from "@/components/print/PrintButton";
import { logSlipPrint } from "@/features/fiscal/print-log";
import { listOutbox } from "@/lib/offline-db";
import { formatDateTime } from "@/lib/format";
import { fetchRecentSales } from "../api";
import { isWorkingOffline, useOfflineStore } from "../offline-store";
import { mergeRecentSales } from "../recent-sales";
import { Receipt } from "./Receipt";
import { VoidSaleDialog } from "./VoidSaleDialog";

interface RecentSalesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  store: StoreDto | undefined;
}

/**
 * The store's latest sales on the till, including ones still waiting to
 * upload: reprint a receipt, or cancel a sale (VOID_SALE).
 */
export function RecentSalesSheet({ open, onOpenChange, storeId, store }: RecentSalesSheetProps) {
  const { t, i18n } = useTranslation(["pos", "common"]);
  const money = useMoney();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const failedCount = useOfflineStore((s) => s.failedCount);
  const offline = useOfflineStore((s) => isWorkingOffline(s));
  const [reprint, setReprint] = React.useState<SaleDto | null>(null);
  const [toVoid, setToVoid] = React.useState<SaleDto | null>(null);

  const server = useQuery({
    queryKey: ["recent-sales", storeId],
    queryFn: () => fetchRecentSales(storeId),
    enabled: open && !offline,
    retry: false,
  });
  const outbox = useQuery({
    queryKey: ["outbox-recent", pendingCount, failedCount],
    queryFn: () => listOutbox(),
    enabled: open,
  });
  const sales = React.useMemo(
    () => mergeRecentSales(server.data ?? [], outbox.data ?? []).filter((s) => s.storeId === storeId),
    [server.data, outbox.data, storeId],
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["recent-sales", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["outbox-recent"] });
  }

  const cashierName = (sale: SaleDto) =>
    sale.cashierId === userId ? t("recent.you") : sale.cashier ? `${sale.cashier.firstName} ${sale.cashier.lastName}` : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col p-4 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("recent.title")}</SheetTitle>
            <SheetDescription>{t("recent.description")}</SheetDescription>
          </SheetHeader>
          {(offline || server.isError) && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">{t("recent.localOnly")}</p>
          )}
          <ul className="-mx-1 flex-1 divide-y overflow-y-auto">
            {sales.length === 0 && !server.isLoading && (
              <li className="px-1 py-6 text-center text-sm text-muted-foreground">{t("recent.empty")}</li>
            )}
            {sales.map((sale) => {
              const voided = sale.status === SaleStatus.VOIDED;
              const who = cashierName(sale);
              return (
                <li key={sale.clientId ?? sale.id} className="flex items-center gap-3 px-1 py-3" data-testid="recent-sale">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${voided ? "text-muted-foreground line-through" : ""}`}>
                        {money(sale.total)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {sale.payments.map((p) => t(`common:paymentMethods.${p.method}`)).join(" + ")}
                      </span>
                      {voided && <Badge variant="destructive">{t("recent.cancelled")}</Badge>}
                      {sale.queued && <Badge variant="secondary">{t("recent.waiting")}</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(sale.createdAt, i18n.language)} · {sale.receiptNumber}
                      {who && ` · ${who}`}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={t("recent.reprint")} title={t("recent.reprint")} onClick={() => setReprint(sale)}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  {!voided && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("recent.cancel")}
                      title={t("recent.cancel")}
                      onClick={() => setToVoid(sale)}
                    >
                      <Ban className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>

      <Dialog open={!!reprint} onOpenChange={(o) => !o && setReprint(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("recent.reprint")}</DialogTitle>
          </DialogHeader>
          {reprint && (
            <>
              <Receipt sale={reprint} store={store} copy />
              <PrintArea>
                <Receipt sale={reprint} store={store} copy />
              </PrintArea>
            </>
          )}
          <PrintButton
            onPrint={({ copies, deviceName }) => {
              if (reprint) logSlipPrint(reprint, copies);
              return printDocument({ copies, deviceName });
            }}
          />
        </DialogContent>
      </Dialog>

      <VoidSaleDialog
        sale={toVoid}
        store={store}
        onClose={() => setToVoid(null)}
        onVoided={refresh}
      />
    </>
  );
}
