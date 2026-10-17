import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/store";
import { useCurrency } from "@/features/business/use-money";
import { useDocumentLang } from "@/i18n/use-document-language";
import { ApiError, apiClient, saveFile } from "@/lib/api-client";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { ACCOUNTS_KEY, fetchAccounts, fetchJournals, fetchReport, JOURNALS_KEY, type AccountingReportKey, type ReportCell, type ReportParams, type ReportTableDto } from "../api";
import { usePeriodName } from "../use-period-name";

const REPORTS: AccountingReportKey[] = ["trialBalance", "ledger", "journal", "statement", "ageing", "balanceSheet", "incomeStatement", "vat"];
/** jsPDF's built-in fonts have no narrow no-break space (Portuguese thousands): use the plain no-break one. */
const pdfText = (text: string) => text.replace(/\u202f/g, "\u00a0");

/**
 * The accounting reports: Balancete, Razão, Diário, statements and ageing,
 * Balanço, Demonstração de Resultados and the IVA working papers. On screen
 * in the reader's language; PDF and Excel in the documents' language.
 */
export function AccountingReports({ today }: { today: string }) {
  const { t, i18n } = useTranslation("accounting");
  const docLang = useDocumentLang();
  const { t: docT } = useTranslation("accounting", { lng: docLang });
  const currency = useCurrency();
  const business = useAuthStore((s) => s.business);
  const periodName = usePeriodName();
  const [report, setReport] = React.useState<AccountingReportKey>("trialBalance");
  const [year, setYear] = React.useState(Number(today.slice(0, 4)));
  const [fromPeriod, setFromPeriod] = React.useState(0);
  const [toPeriod, setToPeriod] = React.useState(Number(today.slice(5, 7)));
  const [level, setLevel] = React.useState(0);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [journalId, setJournalId] = React.useState<string | null>(null);
  const [party, setParty] = React.useState<"customer" | "supplier">("customer");
  const [partyAccount, setPartyAccount] = React.useState<string | null>(null);
  const [params, setParams] = React.useState<ReportParams | null>(null);
  const accounts = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts });
  const journals = useQuery({ queryKey: JOURNALS_KEY, queryFn: fetchJournals });
  const result = useQuery({ queryKey: ["accounting", "report", params], queryFn: () => fetchReport(params!), enabled: !!params, retry: false });

  const needs = {
    periods: report !== "ageing",
    from: !["ageing", "balanceSheet"].includes(report),
    level: report === "trialBalance",
    account: report === "ledger",
    journal: report === "journal",
    party: report === "statement" || report === "ageing",
  };
  const partyAccounts = (accounts.data ?? []).filter((a) => a.linkType === (party === "customer" ? "CUSTOMER" : "SUPPLIER"));
  const current = (): ReportParams => ({
    report,
    year,
    fromPeriod: needs.from ? fromPeriod : 0,
    toPeriod,
    level: needs.level ? level : undefined,
    accountId: needs.account ? (accountId ?? undefined) : undefined,
    journalId: needs.journal ? (journalId ?? undefined) : undefined,
    party: needs.party ? party : undefined,
    partyId: report === "statement" ? (partyAccounts.find((a) => a.id === partyAccount)?.linkId ?? undefined) : undefined,
  });
  React.useEffect(() => {
    if (result.error) toast.error(result.error instanceof ApiError ? result.error.message : t("failed"));
  }, [result.error, t]);

  // Cells as people read them: on screen in the reader's language, on paper in the documents'.
  const cellText = (kind: string, v: ReportCell, lang: string, tr: (k: string) => string) => {
    if (v === null || v === undefined || v === "") return "";
    if (kind === "money") return pdfText(formatMoney(String(v), currency, lang));
    if (kind === "date") return formatCalendarDate(String(v));
    if (kind === "percent") return `${v} %`;
    if (kind === "label" || v === "openingBalance") return tr(`reports.labels.${v}`);
    return String(v);
  };
  const tr = (k: string) => t(k as "title");
  const docTr = (k: string) => docT(k as "title");
  const heading = (tbl: ReportTableDto, translate: (k: string) => string) => (tbl.title ? (tbl.title.match(/^[a-zA-Z]+$/) ? translate(`reports.labels.${tbl.title}`) : tbl.title) : null);

  async function excel() {
    if (!params) return;
    try {
      const q = new URLSearchParams(Object.entries({ ...params, format: "xlsx" }).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== null && e[0] !== "report").map(([k, v]) => [k, String(v)]));
      saveFile(await apiClient.download(`/accounting/reports/${params.report}?${q}`));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("failed"));
    }
  }

  function pdf() {
    if (!result.data || !params) return;
    const wide = result.data.tables.some((tbl) => tbl.columns.length > 6);
    const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait" });
    doc.setFontSize(14);
    doc.text(pdfText(docT(`reports.names.${params.report}`)), 14, 14);
    doc.setFontSize(9);
    const span = params.report === "ageing" ? docT("reports.at", { date: formatCalendarDate(today) }) : docT("reports.span", { year: params.year, from: params.fromPeriod, to: params.toPeriod });
    doc.text(pdfText(`${result.data.company.name}${result.data.company.taxId ? ` · NIF ${result.data.company.taxId}` : ""} · ${span}`), 14, 20);
    let y = 26;
    for (const tbl of result.data.tables) {
      const title = heading(tbl, docTr);
      if (title) {
        doc.setFontSize(11);
        doc.text(pdfText(title), 14, y + 4);
        y += 6;
      }
      autoTable(doc, {
        startY: y,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [60, 60, 60] },
        head: [tbl.columns.map((c) => pdfText(docT(`reports.labels.${c.key}` as "title")))],
        body: [...tbl.rows, ...(tbl.totals ? [tbl.totals] : [])].map((row, i) =>
          tbl.columns.map((c, j) => (i === tbl.rows.length && j === 0 && !row[c.key] ? "Total" : cellText(c.kind, row[c.key], docLang, docTr))),
        ),
        columnStyles: Object.fromEntries(tbl.columns.map((c, i) => [i, { halign: c.kind === "money" || c.kind === "count" || c.kind === "percent" ? "right" : "left" }])),
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
    }
    doc.save(`${docT(`reports.names.${params.report}`)}_${params.year}.pdf`);
  }

  const periodOptions = Array.from({ length: 16 }, (_, n) => ({ value: String(n), label: `${n} · ${periodName(year, n)}` }));
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="report-key">{t("reports.report")}</Label>
            <Combobox id="report-key" value={report} onChange={(v) => v && setReport(v as AccountingReportKey)} options={REPORTS.map((r) => ({ value: r, label: t(`reports.names.${r}`), description: t(`reports.hints.${r}`) }))} />
          </div>
          {needs.periods && (
            <div className="space-y-1">
              <Label htmlFor="report-year">{t("entries.year")}</Label>
              <Input id="report-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
            </div>
          )}
          {needs.from && (
            <div className="space-y-1">
              <Label htmlFor="report-from">{t("reports.fromPeriod")}</Label>
              <Combobox id="report-from" value={String(fromPeriod)} onChange={(v) => v && setFromPeriod(Number(v))} options={periodOptions} />
            </div>
          )}
          {needs.periods && (
            <div className="space-y-1">
              <Label htmlFor="report-to">{t("reports.toPeriod")}</Label>
              <Combobox id="report-to" value={String(toPeriod)} onChange={(v) => v && setToPeriod(Number(v))} options={periodOptions} />
            </div>
          )}
          {needs.level && (
            <div className="space-y-1">
              <Label htmlFor="report-level">{t("reports.level")}</Label>
              <Combobox
                id="report-level"
                value={String(level)}
                onChange={(v) => v && setLevel(Number(v))}
                options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 0 ? t("reports.allLevels") : t("reports.levelN", { n }) }))}
              />
            </div>
          )}
          {needs.account && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="report-account">{t("entries.account")}</Label>
              <Combobox id="report-account" value={accountId} onChange={setAccountId} options={(accounts.data ?? []).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))} placeholder={t("entries.chooseAccount")} />
            </div>
          )}
          {needs.journal && (
            <div className="space-y-1">
              <Label htmlFor="report-journal">{t("entries.journal")}</Label>
              <Combobox id="report-journal" value={journalId} onChange={setJournalId} clearLabel={t("entries.allJournals")} placeholder={t("entries.allJournals")} options={(journals.data ?? []).map((j) => ({ value: j.id, label: `${j.code} – ${j.name}` }))} />
            </div>
          )}
          {needs.party && (
            <div className="space-y-1">
              <Label htmlFor="report-party">{t("reports.party")}</Label>
              <Combobox
                id="report-party"
                value={party}
                onChange={(v) => {
                  if (v) setParty(v as "customer" | "supplier");
                  setPartyAccount(null);
                }}
                options={[
                  { value: "customer", label: t("reports.customers") },
                  { value: "supplier", label: t("reports.suppliers") },
                ]}
              />
            </div>
          )}
          {report === "statement" && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="report-party-account">{party === "customer" ? t("reports.customer") : t("reports.supplier")}</Label>
              <Combobox id="report-party-account" value={partyAccount} onChange={setPartyAccount} clearLabel={t("reports.everyone")} placeholder={t("reports.everyone")} options={partyAccounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button onClick={() => setParams(current())} disabled={needs.account && !accountId}>
              {t("reports.show")}
            </Button>
            <Button variant="outline" onClick={pdf} disabled={!result.data}>
              <FileDown className="mr-2 h-4 w-4" aria-hidden />
              PDF
            </Button>
            <Button variant="outline" onClick={excel} disabled={!result.data}>
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />
              Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {result.isFetching && <p className="text-muted-foreground">{t("reports.loading")}</p>}
      {result.data && params && (
        <div className="space-y-6" data-testid="accounting-report">
          <p className="text-sm text-muted-foreground">
            {result.data.company.name} · {params.report === "ageing" ? t("reports.at", { date: formatCalendarDate(today) }) : t("reports.span", { year: params.year, from: params.fromPeriod, to: params.toPeriod })}
            {business?.country === "AO" && ` · ${t("chart.templateNote")}`}
          </p>
          {result.data.tables.length === 0 && <p className="text-muted-foreground">{t("reports.empty")}</p>}
          {result.data.tables.map((tbl, n) => (
            <div key={n} className="space-y-2">
              {heading(tbl, tr) && <h3 className="font-medium">{heading(tbl, tr)}</h3>}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {tbl.columns.map((c) => (
                        <th key={c.key} className={`whitespace-nowrap p-2 font-medium ${c.kind === "money" || c.kind === "count" || c.kind === "percent" ? "text-right" : "text-left"}`}>
                          {t(`reports.labels.${c.key}` as "title")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tbl.rows.map((row, i) => {
                      const style = row._style as string | undefined;
                      return (
                        <tr key={i} className={`border-t ${style === "section" ? "bg-muted/30 font-semibold" : style === "subtotal" ? "font-medium" : style === "total" ? "bg-muted/50 font-semibold" : ""}`}>
                          {tbl.columns.map((c) => (
                            <td
                              key={c.key}
                              className={`p-2 ${c.kind === "money" || c.kind === "count" || c.kind === "percent" ? "whitespace-nowrap text-right" : ""} ${c.kind === "code" ? "font-mono text-xs" : ""}`}
                              style={c.key === "code" && typeof row._level === "number" ? { paddingLeft: `${0.5 + (row._level - 1) * 0.75}rem` } : undefined}
                            >
                              {cellText(c.kind, row[c.key], i18n.language, tr)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                  {tbl.totals && (
                    <tfoot className="border-t bg-muted/50 font-semibold">
                      <tr>
                        {tbl.columns.map((c, j) => (
                          <td key={c.key} className={`p-2 ${c.kind === "money" ? "whitespace-nowrap text-right" : ""}`}>
                            {j === 0 && !tbl.totals![c.key] ? t("reports.total") : cellText(c.kind, tbl.totals![c.key], i18n.language, tr)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
