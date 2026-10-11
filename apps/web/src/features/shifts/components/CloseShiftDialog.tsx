import * as React from "react";
import { useTranslation } from "react-i18next";
import { DrawerOpenReason, type StoreDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PrintArea } from "@/components/print/PrintArea";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { openCashDrawer, useHasDrawer } from "@/features/desktop/drawer";
import { printDocument } from "@/features/desktop/printing";
import { isWorkingOffline } from "@/features/pos/offline-store";
import { syncOutbox } from "@/features/pos/sync";
import { closeShift, fetchShiftByClient } from "../api";
import type { LocalShift } from "../ledger";
import { reportFromLocal, reportFromServer } from "../report-data";
import { ShiftReport, type ShiftReportData } from "./ShiftReport";

/**
 * Closing the till: count the cash first, without seeing what's expected
 * (so the count is honest), then see the difference and print the report.
 */
export function CloseShiftDialog({
  shift,
  store,
  open,
  onOpenChange,
}: {
  shift: LocalShift | null;
  store: StoreDto | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("shifts");
  const money = useMoney();
  const hasDrawer = useHasDrawer();
  const user = useAuthStore((s) => s.user);
  const [counted, setCounted] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState<ShiftReportData | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCounted("");
    setNote("");
    setReport(null);
    // The drawer opens so the cash can be counted.
    if (hasDrawer) void openCashDrawer({ reason: DrawerOpenReason.SHIFT_CLOSE });
  }, [open, hasDrawer]);

  const value = Number(counted.replace(",", "."));
  const valid = counted.trim() !== "" && Number.isFinite(value) && value >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!shift || !valid || busy) return;
    setBusy(true);
    const countedCash = Math.round(value * 100) / 100;
    const { closedAt } = await closeShift(shift, countedCash, note);
    let data = reportFromLocal(shift, {
      countedCash,
      closedAt,
      closedBy: user ? `${user.firstName} ${user.lastName}` : "",
      note,
    });
    // Online: the server's report, which also has returns and other tills' uploads.
    if (!isWorkingOffline()) {
      try {
        await syncOutbox();
        data = reportFromServer(await fetchShiftByClient(shift.storeId, shift.clientId));
      } catch {
        // offline after all: the till's own report stands
      }
    }
    setReport(data);
    setBusy(false);
  }

  const difference = report?.countedCash != null ? report.countedCash - report.expectedCash : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        {!report ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("close.title")}</DialogTitle>
              <DialogDescription>{t("close.description")}</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="counted-cash">{t("close.counted")}</Label>
                <Input id="counted-cash" inputMode="decimal" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="close-note">{t("close.note")}</Label>
                <Textarea id="close-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={!valid || busy}>
                {busy ? t("close.closing") : t("close.submit")}
              </Button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("close.done")}</DialogTitle>
              <DialogDescription>
                {Math.abs(difference) < 0.005
                  ? t("close.balanced")
                  : difference > 0
                    ? t("close.over", { amount: money(difference) })
                    : t("close.short", { amount: money(-difference) })}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-white py-3 text-black">
              <ShiftReport data={report} store={store} />
            </div>
            <PrintArea>
              <ShiftReport data={report} store={store} />
            </PrintArea>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void printDocument()}>{t("close.print")}</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("close.finish")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
