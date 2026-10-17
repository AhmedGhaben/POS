import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { ACCOUNTING_KEY, closePeriod, closeYear, createFiscalYear, fetchFiscalYears, reopenPeriod, reopenYear, workOutResults, YEARS_KEY, type FiscalYearDto } from "../api";
import { usePeriodName } from "../use-period-name";

/** Fiscal years and their periods: close a month when it's done; reopening asks why. */
export function FiscalYears({ canWrite, today }: { canWrite: boolean; today: string }) {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const periodName = usePeriodName();
  const years = useQuery({ queryKey: YEARS_KEY, queryFn: fetchFiscalYears });
  // number null = the whole year.
  const [reopening, setReopening] = React.useState<{ year: number; number: number | null } | null>(null);
  const [reason, setReason] = React.useState("");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEY });
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const close = useMutation({ mutationFn: (p: { year: number; number: number }) => closePeriod(p.year, p.number), onSuccess: () => (refresh(), toast.success(t("periods.closedToast"))), onError: fail });
  const reopen = useMutation({
    mutationFn: () => (reopening!.number === null ? reopenYear(reopening!.year, reason.trim()) : reopenPeriod(reopening!.year, reopening!.number, reason.trim())),
    onSuccess: () => {
      refresh();
      setReopening(null);
      setReason("");
      toast.success(t("periods.reopenedToast"));
    },
    onError: fail,
  });
  const results = useMutation({ mutationFn: workOutResults, onSuccess: () => (refresh(), toast.success(t("periods.resultsDone"))), onError: fail });
  const closeTheYear = useMutation({ mutationFn: closeYear, onSuccess: () => (refresh(), toast.success(t("periods.yearClosed"))), onError: fail });
  const nextYear = Math.max(Number(today.slice(0, 4)), ...(years.data ?? []).map((y) => y.year)) + 1;
  const addYear = useMutation({ mutationFn: () => createFiscalYear(nextYear), onSuccess: refresh, onError: fail });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("periods.description")}</p>
      {canWrite && (
        <Button variant="outline" size="sm" onClick={() => addYear.mutate()} disabled={addYear.isPending}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          {t("periods.addYear", { year: nextYear })}
        </Button>
      )}
      {years.data?.map((y: FiscalYearDto) => (
        <Card key={y.year}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">{t("periods.year", { year: y.year })}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {canWrite && y.status === "OPEN" && (
                <>
                  <Button size="sm" variant="outline" disabled={results.isPending} onClick={() => results.mutate(y.year)}>
                    {t("periods.workOutResults")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={closeTheYear.isPending} onClick={() => closeTheYear.mutate(y.year)}>
                    {t("periods.closeYear")}
                  </Button>
                </>
              )}
              {canWrite && y.status === "CLOSED" && (
                <Button size="sm" variant="outline" onClick={() => setReopening({ year: y.year, number: null })}>
                  {t("periods.reopenYear")}
                </Button>
              )}
              <Badge variant={y.status === "OPEN" ? "secondary" : "outline"}>{t(`periods.statuses.${y.status}`)}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {y.periods.map((p) => (
                <div key={p.number} className={`rounded-md border p-2 text-sm ${p.status === "CLOSED" ? "bg-muted/60" : ""}`} data-testid={`period-${y.year}-${p.number}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {p.number} · {periodName(y.year, p.number)}
                    </span>
                    {p.status === "CLOSED" ? <Lock className="h-4 w-4 text-muted-foreground" aria-label={t("periods.statuses.CLOSED")} /> : <LockOpen className="h-4 w-4 text-muted-foreground" aria-label={t("periods.statuses.OPEN")} />}
                  </div>
                  {p.status === "CLOSED" && p.closedAt && <p className="text-xs text-muted-foreground">{t("periods.closedBy", { name: p.closedBy ?? "-", at: formatDateTime(p.closedAt) })}</p>}
                  {canWrite && y.status === "OPEN" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2"
                      onClick={() => (p.status === "OPEN" ? close.mutate({ year: y.year, number: p.number }) : setReopening({ year: y.year, number: p.number }))}
                    >
                      {p.status === "OPEN" ? t("periods.close") : t("periods.reopen")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <Dialog open={!!reopening} onOpenChange={(o) => !o && setReopening(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reopening &&
                (reopening.number === null
                  ? t("periods.reopenYearTitle", { year: reopening.year })
                  : t("periods.reopenTitle", { period: `${reopening.number} · ${periodName(reopening.year, reopening.number)}`, year: reopening.year }))}
            </DialogTitle>
            <DialogDescription>{t("periods.reopenHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">{t("periods.reason")}</Label>
            <Input id="reopen-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button disabled={reason.trim().length < 3 || reopen.isPending} onClick={() => reopen.mutate()}>
            {t("periods.reopen")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
