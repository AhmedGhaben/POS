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
import { fetchShift, fetchShifts } from "@/features/shifts/api";
import { ShiftReport } from "@/features/shifts/components/ShiftReport";
import { reportFromServer } from "@/features/shifts/report-data";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 25;

const person = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : "—");

/** Every till shift in the store, with the cash difference at close. */
export function ShiftsPage() {
  const { t, i18n } = useTranslation(["shifts", "common"]);
  const money = useMoney();
  const storeId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const store = stores.find((s) => s.id === storeId);
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey: ["shifts", storeId, page],
    queryFn: () => fetchShifts(storeId!, page, PAGE_SIZE),
    enabled: !!storeId,
  });
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
                  <TableCell>{formatDateTime(s.openedAt, i18n.language)}</TableCell>
                  <TableCell>{s.terminal ? `${s.terminal.code} ${s.terminal.name}` : t("page.browser")}</TableCell>
                  <TableCell>{person(s.openedBy)}</TableCell>
                  <TableCell>
                    {s.status === "OPEN" ? <Badge variant="secondary">{t("page.open")}</Badge> : formatDateTime(s.closedAt!, i18n.language)}
                  </TableCell>
                  <TableCell className="text-right">{s.expectedCash != null ? money(s.expectedCash) : "—"}</TableCell>
                  <TableCell className="text-right">{s.countedCash != null ? money(s.countedCash) : "—"}</TableCell>
                  <TableCell className="text-right">{differenceCell(s)}</TableCell>
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
