import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DrawerOpenReason, type StoreDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { signOut } from "../close-request";
import { cleanCounts, countTotal, denominationsFor } from "../denominations";
import { cashDifference, notInDrawer } from "../cash-check";
import { isEmptyShift, isEmptySummary, localSummary, type LocalShift } from "../ledger";
import { reportFromLocal, reportFromServer } from "../report-data";
import { ShiftReport, type ShiftReportData } from "./ShiftReport";
import { NumericField } from "@/components/ui/numeric-field";

/**
 * Closing the till: count the cash first, without seeing what's expected
 * (so the count is honest), as a total or note by note; then see the
 * difference, print the report (owners and managers see the expected cash
 * and the difference as they type; the count stays blind for cashiers), and the person who closed it is signed
 * out. A manager closing someone else's abandoned shift stays signed in.
 * A shift with no sales and no cash in or out closes in one click: the
 * cash should be the opening float ("Contagem = fundo de caixa?"), and
 * another amount can still be typed.
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
  const navigate = useNavigate();
  const hasDrawer = useHasDrawer();
  const user = useAuthStore((s) => s.user);
  const currency = useAuthStore((s) => s.business?.currency);
  const denominations = denominationsFor(store?.country, currency);
  const [byNote, setByNote] = React.useState(false);
  const [counts, setCounts] = React.useState<Record<string, string>>({});
  const [counted, setCounted] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState<ShiftReportData | null>(null);
  const [withSales, setWithSales] = React.useState(false);
  const forced = !!shift && !!user && shift.openedBy.id !== user.id;
  // Nothing happened in the shift: offer the opening float as the count.
  const [empty, setEmpty] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [otherAmount, setOtherAmount] = React.useState(false);

  React.useEffect(() => {
    if (!open || !shift) return;
    setOtherAmount(false);
    setEmpty(false);
    if (!shift.adopted) {
      setEmpty(isEmptyShift(shift));
    } else if (!isWorkingOffline()) {
      // A shift taken over from another device: only the server knows what's in it.
      setChecking(true);
      void fetchShiftByClient(shift.storeId, shift.clientId)
        .then((server) => setEmpty(!!server.summary && isEmptySummary(server.summary)))
        .catch(() => undefined)
        .finally(() => setChecking(false));
    }
  }, [open, shift]);

  React.useEffect(() => {
    if (!open) return;
    setCounted("");
    setCounts({});
    setByNote(false);
    setNote("");
    setReport(null);
    // The drawer opens so the cash can be counted.
    if (hasDrawer) void openCashDrawer({ reason: DrawerOpenReason.SHIFT_CLOSE });
  }, [open, hasDrawer]);

  const cleaned = byNote ? cleanCounts(counts) : null;
  const value = byNote ? (cleaned ? countTotal(cleaned) : NaN) : Number(counted.replace(",", "."));
  const valid = byNote ? cleaned !== null : counted.trim() !== "" && Number.isFinite(value) && value >= 0;
  // Not blind for owners and managers, when this till knows the whole shift.
  const live = (user?.role === "OWNER" || user?.role === "MANAGER") && !!shift && !shift.adopted ? localSummary(shift) : null;
  const liveDifference = live && valid ? cashDifference(value, Number(live.expectedCash)) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    void closeWith(Math.round(value * 100) / 100);
  }

  async function closeWith(countedCash: number) {
    if (!shift || busy) return;
    setBusy(true);
    const { closedAt } = await closeShift(shift, countedCash, note, byNote ? cleaned : null);
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

  /** Done: the cashier's shift is over, so they're signed out (not a manager closing someone else's). */
  function finish() {
    onOpenChange(false);
    if (report && !forced) void signOut(navigate);
  }

  const difference = report?.countedCash != null ? cashDifference(report.countedCash, report.expectedCash) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && (o ? onOpenChange(true) : report ? finish() : onOpenChange(false))}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-md">
        {!report ? (
          <>
            <DialogHeader>
              <DialogTitle>{forced ? t("close.titleFor", { name: shift?.openedBy.name ?? "" }) : t("close.title")}</DialogTitle>
              <DialogDescription>{forced ? t("close.descriptionForced") : live ? t("close.descriptionLive") : t("close.description")}</DialogDescription>
            </DialogHeader>
            {checking ? (
              <p className="text-sm text-muted-foreground">{t("close.checking")}</p>
            ) : empty && !otherAmount ? (
              <div className="space-y-3" data-testid="quick-close">
                <p className="font-medium">{t("close.quickQuestion", { amount: money(shift?.openingFloat ?? 0) })}</p>
                <p className="text-sm text-muted-foreground">{t("close.quickHint")}</p>
                <Button className="w-full" disabled={busy} onClick={() => void closeWith(shift?.openingFloat ?? 0)}>
                  {busy ? t("close.closing") : t("close.quickConfirm", { amount: money(shift?.openingFloat ?? 0) })}
                </Button>
                <Button variant="outline" className="w-full" disabled={busy} onClick={() => setOtherAmount(true)}>
                  {t("close.quickOther")}
                </Button>
              </div>
            ) : (
            <form className="space-y-4" onSubmit={submit}>
              {denominations && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={byNote} onChange={(e) => setByNote(e.target.checked)} />
                  {t("close.byNote")}
                </label>
              )}
              {byNote && denominations ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {[...denominations.notes, ...denominations.coins].map((d) => (
                      <div key={d} className="flex items-center gap-2">
                        <Label htmlFor={`count-${d}`} className="w-16 shrink-0 text-right text-sm">
                          {money(d)}
                        </Label>
                        <span className="text-muted-foreground">×</span>
                        <NumericField
                          id={`count-${d}`}
                          aria-label={t("close.countOf", { value: money(d) })}
                          keypad="popover"
                          decimals={0}
                          className="h-8"
                          value={counts[String(d)] ?? ""}
                          onValueChange={(v) => setCounts((c) => ({ ...c, [String(d)]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-sm font-medium" data-testid="count-total">
                    {cleaned ? t("close.countTotal", { amount: money(countTotal(cleaned)) }) : t("close.countInvalid")}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="counted-cash">{t("close.counted")}</Label>
                  <NumericField id="counted-cash" autoFocus value={counted} onValueChange={setCounted} />
                </div>
              )}
              {live && (
                <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" data-testid="live-difference">
                  <p className="flex justify-between gap-2">
                    <span>{t("report.expected")}</span>
                    <span className="font-medium">{money(live.expectedCash)}</span>
                  </p>
                  {notInDrawer(live) > 0 && (
                    <p className="flex justify-between gap-2 text-muted-foreground">
                      <span>{t("report.notInDrawer")}</span>
                      <span className="shrink-0">{money(notInDrawer(live))}</span>
                    </p>
                  )}
                  {liveDifference !== null && (
                    <p className={`flex justify-between gap-2 font-semibold ${liveDifference < 0 ? "text-destructive" : ""}`}>
                      <span>{t("report.difference")}</span>
                      <span>
                        {liveDifference === 0
                          ? t("close.balanced")
                          : liveDifference > 0
                            ? t("report.over", { amount: money(liveDifference) })
                            : t("report.short", { amount: money(-liveDifference) })}
                      </span>
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="close-note">{t("close.note")}</Label>
                <Textarea id="close-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={!valid || busy}>
                {busy ? t("close.closing") : t("close.submit")}
              </Button>
            </form>
            )}
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={withSales} onChange={(e) => setWithSales(e.target.checked)} />
              {t("close.withSales")}
            </label>
            <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-white py-3 text-black">
              <ShiftReport data={report} store={store} withSales={withSales} />
            </div>
            <PrintArea>
              <ShiftReport data={report} store={store} withSales={withSales} />
            </PrintArea>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void printDocument()}>{t("close.print")}</Button>
              <Button variant="outline" onClick={finish}>
                {forced ? t("close.finish") : t("close.finishSignOut")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
