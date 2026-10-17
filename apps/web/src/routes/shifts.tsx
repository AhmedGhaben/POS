import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ShiftDto } from "@pos/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintArea } from "@/components/print/PrintArea";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { printDocument } from "@/features/desktop/printing";
import { fetchShift, fetchShiftPeople, fetchShifts, type ShiftFilters } from "@/features/shifts/api";
import { fetchTerminals } from "@/features/desktop/api";
import { Combobox } from "@/components/ui/combobox";
import { ShiftReport } from "@/features/shifts/components/ShiftReport";
import { reportFromServer } from "@/features/shifts/report-data";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 25;

const person = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : "—");

/** Every till shift in the store, with the cash difference at close. */
export function ShiftsPage() {
  const { t } = useTranslation(["shifts", "common"]);
  const money = useMoney();
  const storeId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const store = stores.find((s) => s.id === storeId);
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<ShiftFilters>({});
  const filter = (next: Partial<ShiftFilters>) => {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  };

  const list = useQuery({
    queryKey: ["shifts", storeId, page, filters],
    queryFn: () => fetchShifts(storeId!, page, PAGE_SIZE, filters),
    enabled: !!storeId,
  });
  const people = useQuery({ queryKey: ["shift-people"], queryFn: fetchShiftPeople });
  const tills = useQuery({ queryKey: ["terminals"], queryFn: fetchTerminals });
  const detail = useQuery({ queryKey: ["shift", openId], queryFn: () => fetchShift(openId!), enabled: !!openId });
  const pageCount = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  const differenceCell = (s: ShiftDto) => {
    if (s.difference == null) return "—";
    const d = Number(s.difference);
    const text = `${d > 0 ? "+" : ""}${money(d)}`;
    return Math.abs(d) < 0.005 ? text : <span className="font-semibold text-destructive">{text}</span>;
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("common:nav.shifts")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.description")}</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Combobox
          className="w-40"
          aria-label={t("page.filterStatus")}
          value={filters.status ?? "ALL"}
          onChange={(v) => filter({ status: v === "OPEN" || v === "CLOSED" ? v : undefined })}
          options={[
            { value: "ALL", label: t("page.allShifts") },
            { value: "OPEN", label: t("page.open") },
            { value: "CLOSED", label: t("page.closedOnes") },
          ]}
        />
        <Combobox
          className="w-48"
          aria-label={t("page.filterCashier")}
          value={filters.cashierId ?? null}
          placeholder={t("page.allCashiers")}
          clearLabel={t("page.allCashiers")}
          onChange={(v) => filter({ cashierId: v ?? undefined })}
          options={(people.data ?? []).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))}
        />
        <Combobox
          className="w-48"
          aria-label={t("page.filterTill")}
          value={filters.terminalId ?? null}
          placeholder={t("page.allTills")}
          clearLabel={t("page.allTills")}
          onChange={(v) => filter({ terminalId: v ?? undefined })}
          options={(tills.data ?? []).filter((x) => x.storeId === storeId).map((x) => ({ value: x.id, label: x.name, description: x.code }))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={!!filters.flagged} onChange={(e) => filter({ flagged: e.target.checked || undefined })} />
          {t("page.onlyFlagged")}
        </label>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("page.opened")}</TableHead>
                <TableHead>{t("page.till")}</TableHead>
                <TableHead>{t("page.openedBy")}</TableHead>
                <TableHead>{t("page.closed")}</TableHead>
                <TableHead className="text-right">{t("page.expected")}</TableHead>
                <TableHead className="text-right">{t("page.counted")}</TableHead>
                <TableHead className="text-right">{t("page.difference")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t("page.empty")}
                  </TableCell>
                </TableRow>
              )}
              {list.data?.items.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpenId(s.id)}>
                  <TableCell>{formatDateTime(s.openedAt)}</TableCell>
                  <TableCell>{s.terminal ? `${s.terminal.code} ${s.terminal.name}` : t("page.browser")}</TableCell>
                  <TableCell>{person(s.openedBy)}</TableCell>
                  <TableCell>
                    {s.status === "OPEN" ? <Badge variant="secondary">{t("page.open")}</Badge> : formatDateTime(s.closedAt!)}
                  </TableCell>
                  <TableCell className="text-right">{s.expectedCash != null ? money(s.expectedCash) : "—"}</TableCell>
                  <TableCell className="text-right">{s.countedCash != null ? money(s.countedCash) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {differenceCell(s)}
                    {s.flagged && (
                      <Badge variant="destructive" className="ml-2">
                        {t("page.flagged")}
                      </Badge>
                    )}
                    {s.forcedClose && (
                      <Badge variant="outline" className="ml-2" title={t("page.forcedHint", { name: person(s.closedBy) })}>
                        {t("page.forced")}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common:pagination.previous")}
          </Button>
          <span>{t("common:pagination.page", { page, total: pageCount })}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            {t("common:pagination.next")}
          </Button>
        </div>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("report.title")}</DialogTitle>
          </DialogHeader>
          {detail.data && (
            <>
              <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-white py-3 text-black">
                <ShiftReport data={reportFromServer(detail.data)} store={store} />
              </div>
              <PrintArea>
                <ShiftReport data={reportFromServer(detail.data)} store={store} />
              </PrintArea>
              <Button onClick={() => void printDocument()}>{t("close.print")}</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
