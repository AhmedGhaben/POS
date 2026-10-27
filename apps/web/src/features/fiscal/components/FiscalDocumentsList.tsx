import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { FiscalDocumentType } from "@pos/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/features/business/use-money";
import { formatCalendarDate } from "@/lib/format";
import { fetchFiscalDocuments } from "../api";
import { documentTitle } from "../fiscal-text";
import { FiscalDocumentDialog } from "./FiscalDocumentDialog";

const PAGE_SIZE = 25;
const TYPES: FiscalDocumentType[] = ["FR", "FT", "NC", "RC", "PF"];

/** Every fiscal document of the business, newest first: filter, open, reprint. */
export function FiscalDocumentsList() {
  const { t } = useTranslation(["invoices", "common"]);
  const money = useMoney();
  const [type, setType] = React.useState<string | null>(null);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [includeExpired, setIncludeExpired] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [viewing, setViewing] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["fiscal-documents", "list", type, from, to, search, includeExpired, page],
    queryFn: () => fetchFiscalDocuments({ type: type ?? undefined, from, to, search: search.trim(), includeExpired, page, pageSize: PAGE_SIZE }),
  });
  const data = query.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const reset = () => setPage(1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Combobox
            value={type}
            onChange={(v) => {
              setType(v);
              reset();
            }}
            aria-label={t("fiscal.type")}
            placeholder={t("fiscal.allTypes")}
            clearLabel={t("fiscal.allTypes")}
            options={TYPES.map((code) => ({ value: code, label: documentTitle(code, "AO"), description: code }))}
          />
        </div>
        <DateInput className="w-40" aria-label={t("fiscal.from")} value={from} onChange={(v) => (setFrom(v), reset())} />
        <DateInput className="w-40" aria-label={t("fiscal.to")} value={to} onChange={(v) => (setTo(v), reset())} />
        <Input className="max-w-xs" placeholder={t("fiscal.searchPlaceholder")} value={search} onChange={(e) => (setSearch(e.target.value), reset())} />
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={includeExpired} onChange={(e) => (setIncludeExpired(e.target.checked), reset())} />
          {t("fiscal.showExpired")}
        </label>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fiscal.number")}</TableHead>
                <TableHead>{t("page.columns.date")}</TableHead>
                <TableHead>{t("fiscal.customer")}</TableHead>
                <TableHead className="text-right">{t("fiscal.tax")}</TableHead>
                <TableHead className="text-right">{t("page.columns.total")}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    {d.documentNo}
                    {d.status === "A" && (
                      <Badge variant="destructive" className="ml-2">
                        {t("fiscal.annulled")}
                      </Badge>
                    )}
                    {d.status === "F" && (
                      <Badge variant="secondary" className="ml-2">
                        {t("fiscal.invoiced")}
                      </Badge>
                    )}
                    {d.documentType === "PF" && d.status === "N" && d.expired && (
                      <Badge variant="outline" className="ml-2" title={d.validUntil ? t("fiscal.validUntil", { date: formatCalendarDate(d.validUntil) }) : undefined}>
                        {t("fiscal.expired")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatCalendarDate(d.invoiceDate)}</TableCell>
                  <TableCell>
                    {d.buyerName}
                    <span className="block text-xs text-muted-foreground">NIF {d.buyerTaxId}</span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{money(d.taxPayable)}</TableCell>
                  <TableCell className="text-right">{money(d.grossTotal)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button variant="outline" size="sm" onClick={() => setViewing(d.id)}>
                      {t("page.viewPrint")}
                    </Button>
                    {d.documentType === "PF" && d.status === "N" && !d.expired && (
                      <Button size="sm" className="ml-2" onClick={() => navigate(`/pos?proforma=${d.id}`)}>
                        {t("fiscal.sellProforma")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("fiscal.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common:pagination.previous")}
          </Button>
          <span className="text-muted-foreground">{t("common:pagination.page", { page, total: pageCount })}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            {t("common:pagination.next")}
          </Button>
        </div>
      )}

      <FiscalDocumentDialog documentId={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
