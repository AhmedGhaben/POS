import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { DrawerOpenReason, type DrawerEventDto, type PagedDto } from "@pos/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 50;

function fetchDrawerEvents(page: number, reason: DrawerOpenReason | null) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (reason) params.set("reason", reason);
  return apiClient.get<PagedDto<DrawerEventDto>>(`/drawer-events?${params}`);
}

function reasonLabel(e: DrawerEventDto, t: TFunction<["drawerEvents", "common"]>) {
  if (e.reason === DrawerOpenReason.SALE_CASH_PAYMENT) return t("cashSale");
  return t("noSale", { reason: t(`common:drawerReasons.${e.subReason ?? "OTHER"}`) });
}

/** Every cash drawer opening, newest first. Manual openings are what owners watch. */
export function DrawerEventsPage() {
  const { t } = useTranslation(["drawerEvents", "common"]);
  const [page, setPage] = React.useState(1);
  const [manualOnly, setManualOnly] = React.useState(true);
  const query = useQuery({
    queryKey: ["drawer-events", page, manualOnly],
    queryFn: () => fetchDrawerEvents(page, manualOnly ? DrawerOpenReason.MANUAL_OPEN : null),
  });
  const data = query.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.cashDrawer")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={manualOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setManualOnly(true);
              setPage(1);
            }}
          >
            {t("withoutSale")}
          </Button>
          <Button
            variant={manualOnly ? "outline" : "default"}
            size="sm"
            onClick={() => {
              setManualOnly(false);
              setPage(1);
            }}
          >
            {t("allOpenings")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.when")}</TableHead>
                <TableHead>{t("columns.who")}</TableHead>
                <TableHead>{t("columns.till")}</TableHead>
                <TableHead>{t("columns.reason")}</TableHead>
                <TableHead>{t("columns.note")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(e.occurredAt)}</TableCell>
                  <TableCell>
                    {e.user.firstName} {e.user.lastName}
                    <span className="block text-xs text-muted-foreground">{e.user.email}</span>
                  </TableCell>
                  <TableCell>
                    {e.terminal ? `${e.terminal.code} · ${e.terminal.name}` : t("unregisteredTill")}
                    <span className="block text-xs text-muted-foreground">{e.store.name}</span>
                  </TableCell>
                  <TableCell>{reasonLabel(e, t)}</TableCell>
                  <TableCell className="max-w-[16rem] text-muted-foreground [overflow-wrap:anywhere]">{e.note}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {!e.permitted && <Badge variant="destructive">{t("badges.noPermission")}</Badge>}
                      {!e.succeeded && (
                        <Badge variant="outline" title={e.error ?? undefined}>
                          {t("badges.didntOpen")}
                        </Badge>
                      )}
                      {e.createdOffline && <Badge variant="secondary">{t("badges.offline")}</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {manualOnly ? t("emptyManual") : t("emptyAll")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common:pagination.previous")}
          </Button>
          <span className="text-muted-foreground">
            {t("common:pagination.page", { page, total: pageCount })}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            {t("common:pagination.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
