import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { countryConfig, SaleStatus, type SaleDto } from "@pos/shared";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintArea } from "@/components/print/PrintArea";
import { PrintButton } from "@/components/print/PrintButton";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { printDocument } from "@/features/desktop/printing";
import { FiscalDocumentDialog } from "@/features/fiscal/components/FiscalDocumentDialog";
import { logSlipPrint } from "@/features/fiscal/print-log";
import { saleDocument } from "@/features/fiscal/sale-document";
import { IssueInvoiceDialog } from "@/features/invoices/components/IssueInvoiceDialog";
import { Receipt } from "@/features/pos/components/Receipt";
import { todayIn } from "@/features/reports/export-periods";
import { fetchSalesHistory } from "@/features/sales/api";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

const PAGE = 25;

/**
 * Sales history (docs/plans/ANGOLA.md, phase 5): the store's sales by day,
 * status (cancelled, on credit) or receipt / document number / customer.
 * Open one to reprint its slip ("2ª Via"), print its A4 document, or, where
 * sales aren't fiscal documents, issue an invoice for it.
 */
export function SalesPage() {
  const { t } = useTranslation(["backoffice", "common"]);
  const money = useMoney();
  const storeId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const store = stores.find((s) => s.id === storeId);
  const today = todayIn(countryConfig(store?.country ?? null)?.timeZone ?? "UTC");
  const [from, setFrom] = React.useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = React.useState(today);
  const [status, setStatus] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [open, setOpen] = React.useState<SaleDto | null>(null);
  const [documentId, setDocumentId] = React.useState<string | null>(null);
  const [invoiceFor, setInvoiceFor] = React.useState<SaleDto | null>(null);
  const [exporting, setExporting] = React.useState(false);
  React.useEffect(() => setPage(0), [from, to, status, search, storeId]);

  const filter = { storeId: storeId!, from: from || undefined, to: to || undefined, status: status ?? undefined, search: search.trim() || undefined };
  const sales = useQuery({
    queryKey: ["sales-history", filter, page],
    queryFn: () => fetchSalesHistory({ ...filter, take: PAGE, skip: page * PAGE }),
    enabled: !!storeId,
    placeholderData: keepPreviousData,
  });
  const total = sales.data?.total ?? 0;

  const docNo = (s: SaleDto) => saleDocument(s)?.documentNo ?? s.receiptNumber;
  const paidWith = (s: SaleDto) =>
    [...s.payments.map((p) => t(`common:paymentMethods.${p.method}`)), ...(Number(s.creditAmount ?? 0) > 0 ? [t("sales.onAccount")] : [])].join(" + ");

  async function exportCsv() {
    setExporting(true);
    try {
      const rows: SaleDto[] = [];
      for (let skip = 0; skip < Math.min(total, 5000); skip += 200) rows.push(...(await fetchSalesHistory({ ...filter, take: 200, skip })).items);
      downloadCsv(`${t("sales.file")}-${from || "start"}-${to || today}.csv`, [
        { header: t("sales.date"), value: (s: SaleDto) => formatDateTime(s.createdAt) },
        { header: t("sales.document"), value: docNo },
        { header: t("sales.customer"), value: (s: SaleDto) => s.customer?.name ?? "" },
        { header: "NIF", value: (s: SaleDto) => s.customer?.taxId ?? "" },
        { header: t("sales.cashier"), value: (s: SaleDto) => (s.cashier ? `${s.cashier.firstName} ${s.cashier.lastName}` : "") },
        { header: t("sales.paidWith"), value: paidWith },
        { header: t("sales.tax"), value: (s: SaleDto) => s.taxTotal },
        { header: t("sales.total"), value: (s: SaleDto) => s.total },
        { header: t("sales.status"), value: (s: SaleDto) => (s.status === SaleStatus.VOIDED ? t("sales.cancelled") : t("sales.completed")) },
      ], rows);
    } finally {
      setExporting(false);
    }
  }

  if (!storeId) return <p className="p-6 text-muted-foreground">{t("sales.noStore")}</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.sales")}</h1>
          <p className="text-sm text-muted-foreground">{t("sales.subtitle", { store: store?.name ?? "" })}</p>
        </div>
        <Button variant="outline" disabled={total === 0 || exporting} onClick={() => void exportCsv()}>
          <Download className="mr-2 h-4 w-4" aria-hidden /> {t("common:actions.exportCsv")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="sales-from">{t("sales.from")}</Label>
          <Input id="sales-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sales-to">{t("sales.to")}</Label>
          <Input id="sales-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sales-status">{t("sales.status")}</Label>
          <Combobox
            id="sales-status"
            value={status}
            onChange={setStatus}
            placeholder={t("sales.allStatuses")}
            clearLabel={t("sales.allStatuses")}
            options={[
              { value: "COMPLETED", label: t("sales.completed") },
              { value: "VOIDED", label: t("sales.cancelled") },
              { value: "CREDIT", label: t("sales.onAccount") },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sales-search">{t("sales.search")}</Label>
          <Input id="sales-search" placeholder={t("sales.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sales.date")}</TableHead>
                <TableHead>{t("sales.document")}</TableHead>
                <TableHead>{t("sales.customer")}</TableHead>
                <TableHead>{t("sales.cashier")}</TableHead>
                <TableHead>{t("sales.paidWith")}</TableHead>
                <TableHead className="text-right">{t("sales.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.data?.items.map((s) => (
                <TableRow key={s.id} className={`cursor-pointer ${s.status === SaleStatus.VOIDED ? "text-muted-foreground line-through" : ""}`} onClick={() => setOpen(s)}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{docNo(s)}</TableCell>
                  <TableCell>{s.customer && !s.customer.isFinalConsumer ? s.customer.name : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.cashier ? `${s.cashier.firstName} ${s.cashier.lastName}` : ""}</TableCell>
                  <TableCell className="text-muted-foreground">{paidWith(s)}</TableCell>
                  <TableCell className="text-right">
                    {money(s.total)}
                    {s.status === SaleStatus.VOIDED && <Badge variant="destructive" className="ml-2 no-underline">{t("sales.cancelled")}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {sales.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("sales.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("sales.count", { count: total })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t("sales.previous")}
          </Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
            {t("sales.next")}
          </Button>
        </div>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open ? docNo(open) : ""}</DialogTitle>
          </DialogHeader>
          {open && (
            <>
              <Receipt sale={open} store={store} copy />
              <PrintArea>
                <Receipt sale={open} store={store} copy />
              </PrintArea>
              <div className="grid grid-cols-2 gap-2">
                <PrintButton
                  label={t("sales.reprintSlip")}
                  onPrint={({ copies, deviceName }) => {
                    logSlipPrint(open, copies);
                    return printDocument({ copies, deviceName });
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const doc = saleDocument(open);
                    if (doc?.id) setDocumentId(doc.id);
                    else setInvoiceFor(open);
                    setOpen(null);
                  }}
                >
                  {saleDocument(open) ? t("sales.a4Document") : t("sales.issueInvoice")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <FiscalDocumentDialog documentId={documentId} onClose={() => setDocumentId(null)} />
      <IssueInvoiceDialog sale={invoiceFor} customer={null} onClose={() => setInvoiceFor(null)} />
    </div>
  );
}
