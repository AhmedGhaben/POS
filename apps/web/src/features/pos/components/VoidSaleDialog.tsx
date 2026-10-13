import * as React from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { DrawerOpenReason, PaymentMethod, Permission, VOID_REASONS, type SaleDto, type StoreDto, type VoidReason } from "@pos/shared";
import { useHasPermission } from "@/features/auth/use-permission";
import { requestApproval, type Approval } from "@/features/overrides/approval";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PrintArea } from "@/components/print/PrintArea";
import { useMoney } from "@/features/business/use-money";
import { openCashDrawer, useHasDrawer } from "@/features/desktop/drawer";
import { printDocument } from "@/features/desktop/printing";
import { ApiError } from "@/lib/api-client";
import { voidSale } from "../api";
import { Receipt } from "./Receipt";

interface VoidSaleDialogProps {
  sale: SaleDto | null;
  store: StoreDto | undefined;
  onClose: () => void;
  onVoided: () => void;
}

/**
 * Asks why, cancels the sale (offline too), opens the drawer to hand back
 * cash, and offers the cancellation slip.
 */
export function VoidSaleDialog({ sale, store, onClose, onVoided }: VoidSaleDialogProps) {
  const { t } = useTranslation(["pos", "common"]);
  const money = useMoney();
  const hasDrawer = useHasDrawer();
  const canVoid = useHasPermission(Permission.VOID_SALE);
  const [reason, setReason] = React.useState<VoidReason>("WRONG_ITEMS");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [voided, setVoided] = React.useState<SaleDto | null>(null);
  const [queued, setQueued] = React.useState(false);

  React.useEffect(() => {
    if (sale) {
      setReason("WRONG_ITEMS");
      setNote("");
      setError(null);
      setVoided(null);
    }
  }, [sale]);

  const needsNote = reason === "OTHER" && !note.trim();
  const cashBack = (voided ?? sale)?.payments
    .filter((p) => p.method === PaymentMethod.CASH)
    .reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sale || needsNote) return;
    // Without VOID_SALE, a manager approves this one cancellation.
    let approval: Approval | null = null;
    if (!canVoid) {
      approval = await requestApproval({
        permission: Permission.VOID_SALE,
        action: "sale.void",
        description: t("void.approval", { receipt: sale.receiptNumber, total: money(sale.total) }),
        details: { saleId: sale.id, receiptNumber: sale.receiptNumber, reason },
      });
      if (!approval) return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await voidSale(sale, reason, note, approval);
      setVoided(result.sale);
      setQueued(result.queued);
      onVoided();
      toast.success(t("void.done"));
      if (hasDrawer && cashBack > 0) {
        void openCashDrawer({ reason: DrawerOpenReason.SALE_VOIDED, saleClientId: sale.clientId ?? undefined });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("void.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        {sale && !voided && (
          <>
            <DialogHeader>
              <DialogTitle>{t("void.title", { number: sale.receiptNumber })}</DialogTitle>
              <DialogDescription>{t("void.description", { amount: money(sale.total) })}</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">{t("void.reason")}</legend>
                {VOID_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name="void-reason"
                      className="h-4 w-4"
                      checked={reason === r}
                      onChange={() => setReason(r)}
                    />
                    {t(`common:voidReasons.${r}`)}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="void-note">{reason === "OTHER" ? t("void.note") : t("void.noteOptional")}</Label>
                <Textarea id="void-note" maxLength={300} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                  {t("void.keep")}
                </Button>
                <Button type="submit" variant="destructive" disabled={busy || needsNote}>
                  {busy ? t("void.cancelling") : t("void.confirm")}
                </Button>
              </div>
            </form>
          </>
        )}
        {voided && (
          <>
            <DialogHeader>
              <DialogTitle>{t("void.done")}</DialogTitle>
              {cashBack > 0 && <DialogDescription>{t("void.handBack", { amount: money(cashBack) })}</DialogDescription>}
            </DialogHeader>
            {queued && (
              <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">{t("void.doneOffline")}</p>
            )}
            <Receipt sale={voided} store={store} />
            <PrintArea>
              <Receipt sale={voided} store={store} />
            </PrintArea>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void printDocument()}>{t("void.printSlip")}</Button>
              <Button variant="outline" onClick={onClose}>
                {t("common:actions.close")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
