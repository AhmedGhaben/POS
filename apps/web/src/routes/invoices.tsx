import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SaleDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintArea } from "@/components/print/PrintArea";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { fetchInvoice, fetchInvoices } from "@/features/invoices/api";
import { A4Preview } from "@/features/invoices/components/A4Preview";
import { InvoiceDocument } from "@/features/invoices/components/InvoiceDocument";
import { IssueInvoiceDialog } from "@/features/invoices/components/IssueInvoiceDialog";
import { printDocument } from "@/features/desktop/printing";
import { fetchSalesByStore } from "@/features/sales/api";
import { formatDate, formatDateTime } from "@/lib/format";

const PAGE_SIZE = 25;

/** Reprint: loads the stored invoice (frozen seller details) and prints it. */
function ViewInvoiceDialog({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
  const { t } = useTranslation(["invoices", "common"]);
  const invoiceQuery = useQuery({
    queryKey: ["invoices", "detail", invoiceId],
    queryFn: () => fetchInvoice(invoiceId!),
    enabled: !!invoiceId,
  });
  const invoice = invoiceQuery.data;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{invoice ? t("issue.titleIssued", { number: invoice.number }) : t("page.invoice")}</DialogTitle>
          <DialogDescription>{t("page.reprintNote")}</DialogDescription>
        </DialogHeader>
        {!invoice ? (
          <p className="text-sm text-muted-foreground">{invoiceQuery.isError ? t("page.loadFailed") : t("common:actions.loading")}</p>
        ) : (
          <>
            <A4Preview>
              <InvoiceDocument invoice={invoice} />
            </A4Preview>
            <Button onClick={() => void printDocument()}>
              <Printer className="mr-2 h-4 w-4" /> {t("issue.print")}
            </Button>
            <PrintArea format="a4">
              <InvoiceDocument invoice={invoice} />
            </PrintArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Pick one of the current store's recent sales (the last 50) to invoice. */
function PastSalePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (sale: SaleDto) => void }) {
  const { t } = useTranslation(["invoices", "common"]);
  const money = useMoney();
  const storeId = useAuthStore((s) => s.currentStoreId);
  const storeName = useAuthStore((s) => s.stores.find((st) => st.id === s.currentStoreId)?.name);
  const [saleId, setSaleId] = React.useState<string>("");
  const salesQuery = useQuery({
    queryKey: ["sales", storeId],
    queryFn: () => fetchSalesByStore(storeId!),
    enabled: open && !!storeId,
  });
  const sales = salesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("page.pastSale")}</DialogTitle>
          <DialogDescription>
            {t("page.pastSaleHint", { store: storeName ?? t("page.thisStore") })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("page.sale")}</Label>
          <Select value={saleId} onValueChange={setSaleId}>
            <SelectTrigger>
              <SelectValue placeholder={salesQuery.isLoading ? t("common:actions.loading") : t("page.chooseSale")} />
            </SelectTrigger>
            <SelectContent>
              {sales.map((sale) => (
                <SelectItem key={sale.id} value={sale.id}>
                  {formatDateTime(sale.createdAt)} · {sale.receiptNumber} · {money(sale.total)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {salesQuery.isSuccess && sales.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("page.noSales")}</p>
          )}
        </div>
        <Button
          disabled={!saleId}
          onClick={() => {
            const sale = sales.find((s) => s.id === saleId);
            if (sale) onPick(sale);
            setSaleId("");
          }}
        >
          {t("page.continue")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesPage() {
  const { t } = useTranslation(["invoices", "common"]);
  const money = useMoney();
  const [page, setPage] = React.useState(1);
  const [viewing, setViewing] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [invoicing, setInvoicing] = React.useState<SaleDto | null>(null);
  const invoicesQuery = useQuery({
    queryKey: ["invoices", "list", page],
    queryFn: () => fetchInvoices(page, PAGE_SIZE),
  });
  const data = invoicesQuery.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.invoices")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("page.subtitle")} {data ? t("page.total", { count: data.total }) : ""}
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)}>
          <FilePlus className="mr-2 h-4 w-4" /> {t("page.pastSale")}
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("page.columns.number")}</TableHead>
                <TableHead>{t("page.columns.date")}</TableHead>
                <TableHead>{t("page.columns.billTo")}</TableHead>
                <TableHead>{t("page.columns.receipt")}</TableHead>
                <TableHead className="text-right">{t("page.columns.total")}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.issuedAt)}</TableCell>
                  <TableCell>
                    {inv.buyerName}
                    {inv.buyerTaxId && <span className="block text-xs text-muted-foreground">{inv.buyerTaxId}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{inv.sale.receiptNumber}</TableCell>
                  <TableCell className="text-right">{money(inv.sale.total)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setViewing(inv.id)}>
                      {t("page.viewPrint")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("page.empty")}
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

      <ViewInvoiceDialog invoiceId={viewing} onClose={() => setViewing(null)} />
      <PastSalePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(sale) => {
          setPickerOpen(false);
          setInvoicing(sale);
        }}
      />
      <IssueInvoiceDialog sale={invoicing} customer={null} onClose={() => setInvoicing(null)} />
    </div>
  );
}
