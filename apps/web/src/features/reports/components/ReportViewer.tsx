import * as React from "react";
import { countryConfig } from "@pos/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileDown, Sheet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintArea } from "@/components/print/PrintArea";
import { PrintButton } from "@/components/print/PrintButton";
import { useAuthStore } from "@/features/auth/store";
import { printDocument } from "@/features/desktop/printing";
import { ApiError } from "@/lib/api-client";
import { downloadCsv } from "@/lib/csv";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { useDocumentLang } from "@/i18n/use-document-language";
import { periodDates, todayIn, type PeriodValue } from "../export-periods";
import { cellText, csvCell, isNumeric, type CellFormatters } from "../report-cells";
import { useCellFormatters } from "../use-cell-formatters";
import { fetchReport, REPORT_GROUPS, SNAPSHOT_REPORTS, type ReportKey, type ReportResultDto, type ReportTableDto } from "../tables-api";
import { PeriodFields } from "./PeriodFields";

/**
 * Reports → the business's figures (docs/plans/ANGOLA.md, phase 10): pick
 * a report, a period (calendar days in the shop's time) and a store, see
 * it, take it away as CSV, print it or save it as PDF.
 */
export function ReportViewer() {
  const { t } = useTranslation("reports");
  const business = useAuthStore((s) => s.business);
  const stores = useAuthStore((s) => s.stores);
  const role = useAuthStore((s) => s.user?.role);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const today = todayIn(countryConfig(business?.country ?? null)?.timeZone ?? "UTC");
  const [report, setReport] = React.useState<ReportKey>("salesByDay");
  const [period, setPeriod] = React.useState<PeriodValue>(() => ({ mode: "month", month: today.slice(0, 7), startDate: `${today.slice(0, 7)}-01`, endDate: today }));
  // The whole business is the owner's; a manager sees one of their stores.
  const [storeId, setStoreId] = React.useState<string | null>(role === "OWNER" ? null : (currentStoreId ?? stores[0]?.id ?? null));
  const snapshot = SNAPSHOT_REPORTS.includes(report);
  const dates: { startDate?: string; endDate?: string } = snapshot ? {} : periodDates(period);
  const ready = (role === "OWNER" || !!storeId) && (snapshot || (!!dates.startDate && !!dates.endDate));
  const result = useQuery({
    queryKey: ["reports", "tables", report, storeId, dates.startDate, dates.endDate],
    queryFn: () => fetchReport(report, { storeId, ...dates }),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const f = useCellFormatters();
  // Printed, PDF and CSV: in the store's document language (pt-AO in Angola), whatever the screen's.
  const docLang = useDocumentLang(storeId);
  const docF = useCellFormatters(docLang);
  const { t: docT } = useTranslation("reports", { lng: docLang });
  const storeName = storeId ? (stores.find((s) => s.id === storeId)?.name ?? "") : t("exports.allStores");
  const docStoreName = storeId ? storeName : docT("exports.allStores");
  const data = result.data?.report === report ? result.data : undefined;

  function exportCsv() {
    if (!data) return;
    data.tables.forEach((table, i) => {
      const suffix = data.tables.length > 1 ? `-${table.title ?? i + 1}` : "";
      const span = data.startDate ? `_${data.startDate}_${data.endDate}` : `_${today}`;
      downloadCsv(
        `${report}${suffix}${span}.csv`,
        table.columns.map((c) => ({ header: docT(`tables.columns.${c.key}`, { defaultValue: c.key }), value: (row: Record<string, unknown>) => csvCell(c.kind, (row[c.key] ?? null) as never, docF) })),
        table.totals ? [...table.rows, { ...table.totals, [table.columns[0].key]: docT("tables.total") }] : table.rows,
      );
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="report-kind">{t("tables.report")}</Label>
            <Combobox
              id="report-kind"
              value={report}
              onChange={(v) => v && setReport(v as ReportKey)}
              options={REPORT_GROUPS.flatMap((g) => g.reports.map((r) => ({ value: r, label: t(`tables.names.${r}`), description: t(`tables.groups.${g.group}`) })))}
            />
          </div>
          {snapshot ? (
            <p className="self-end pb-2 text-sm text-muted-foreground">{t("tables.asOfNow")}</p>
          ) : (
            <PeriodFields id="report" value={period} onChange={setPeriod} />
          )}
          <div className="space-y-2">
            <Label htmlFor="report-store">{t("exports.store")}</Label>
            <Combobox
              id="report-store"
              value={storeId}
              onChange={setStoreId}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={role === "OWNER" ? t("exports.allStores") : t("tables.pickStore")}
              clearLabel={role === "OWNER" ? t("exports.allStores") : undefined}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {t(`tables.names.${report}`)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {storeName}
            {data?.startDate && ` · ${formatCalendarDate(data.startDate)} – ${formatCalendarDate(data.endDate!)}`}
          </span>
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Sheet className="mr-2 h-4 w-4" aria-hidden />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!data} title={t("tables.pdfHint")}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden />
            PDF
          </Button>
          <PrintButton disabled={!data} onPrint={({ copies, deviceName }) => printDocument({ copies, deviceName })} />
        </div>
      </div>

      {result.isError && <p className="text-sm text-destructive">{result.error instanceof ApiError ? result.error.message : t("tables.failed")}</p>}
      {!data && result.isFetching && <p className="text-sm text-muted-foreground">{t("tables.loading")}</p>}
      {data?.tables.map((table, i) => (
        <Card key={i}>
          {table.title && <h3 className="px-4 pt-4 font-medium">{t(`tables.titles.${table.title}`, { defaultValue: table.title })}</h3>}
          <CardContent className="overflow-x-auto p-0">
            <ReportTableView table={table} f={f} />
          </CardContent>
        </Card>
      ))}

      {data && (
        <PrintArea format="a4">
          <ReportA4 data={data} storeName={docStoreName} f={docF} lang={docLang} />
        </PrintArea>
      )}
    </div>
  );
}

function ReportTableView({ table, f }: { table: ReportTableDto; f: CellFormatters }) {
  const { t } = useTranslation("reports");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {table.columns.map((c) => (
            <TableHead key={c.key} className={isNumeric(c.kind) ? "text-right" : undefined}>
              {t(`tables.columns.${c.key}`, { defaultValue: c.key })}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((row, r) => (
          <TableRow key={r}>
            {table.columns.map((c) => (
              <TableCell key={c.key} className={isNumeric(c.kind) ? "whitespace-nowrap text-right tabular-nums" : undefined}>
                {cellText(c.kind, row[c.key] ?? null, c.key === "category" ? { ...f, none: t("tables.noCategory") } : f)}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {table.rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={table.columns.length} className="p-6 text-center text-muted-foreground">
              {t("tables.empty")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      {table.totals && table.rows.length > 0 && (
        <TableFooter>
          <TableRow className="font-semibold">
            {table.columns.map((c, i) => (
              <TableCell key={c.key} className={isNumeric(c.kind) ? "whitespace-nowrap text-right tabular-nums" : undefined}>
                {i === 0 ? t("tables.total") : cellText(c.kind, table.totals![c.key] ?? null, { ...f, none: "" })}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

/** The report on A4: the company, which report, period and store, when it was made. */
export function ReportA4({ data, storeName, f, lang }: { data: ReportResultDto; storeName: string; f: CellFormatters; lang: string }) {
  const { t } = useTranslation("reports", { lng: lang });
  const business = useAuthStore((s) => s.business);
  return (
    <div className="a4-doc w-[210mm] bg-white p-[15mm] font-sans text-[8.5pt] leading-snug text-black">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <p className="text-[11pt] font-semibold">{business?.legalName || business?.name}</p>
          {business?.taxId && <p>NIF: {business.taxId}</p>}
          <p>{storeName}</p>
        </div>
        <div className="text-right">
          <p className="text-[13pt] font-bold">{t(`tables.names.${data.report}`)}</p>
          <p>{data.startDate ? `${formatCalendarDate(data.startDate)} – ${formatCalendarDate(data.endDate!)}` : t("tables.asOfNow")}</p>
          <p className="text-neutral-600">{t("tables.generatedAt", { at: formatDateTime(new Date()) })}</p>
        </div>
      </header>
      {data.tables.map((table, i) => (
        <section key={i} className="mt-[6mm]">
          {table.title && <p className="mb-1 font-semibold">{t(`tables.titles.${table.title}`, { defaultValue: table.title })}</p>}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                {table.columns.map((c) => (
                  <th key={c.key} className={`py-1 pr-2 font-semibold ${isNumeric(c.kind) ? "text-right" : ""}`}>
                    {t(`tables.columns.${c.key}`, { defaultValue: c.key })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="break-inside-avoid border-b border-neutral-300">
                  {table.columns.map((c) => (
                    <td key={c.key} className={`py-0.5 pr-2 ${isNumeric(c.kind) ? "whitespace-nowrap text-right" : ""}`}>
                      {cellText(c.kind, row[c.key] ?? null, f)}
                    </td>
                  ))}
                </tr>
              ))}
              {table.rows.length === 0 && (
                <tr>
                  <td colSpan={table.columns.length} className="py-2 text-neutral-600">
                    {t("tables.empty")}
                  </td>
                </tr>
              )}
            </tbody>
            {table.totals && table.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black font-semibold">
                  {table.columns.map((c, ci) => (
                    <td key={c.key} className={`py-1 pr-2 ${isNumeric(c.kind) ? "whitespace-nowrap text-right" : ""}`}>
                      {ci === 0 ? t("tables.total") : cellText(c.kind, table.totals![c.key] ?? null, { ...f, none: "" })}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      ))}
    </div>
  );
}
