import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus, Printer } from "lucide-react";
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
import { fetchSalesByStore } from "@/features/sales/api";

const PAGE_SIZE = 25;

/** Reprint: loads the stored invoice (frozen seller details) and prints it. */
function ViewInvoiceDialog({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
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
          <DialogTitle>{invoice ? `Invoice ${invoice.number}` : "Invoice"}</DialogTitle>
          <DialogDescription>Reprints exactly as issued, even if your settings have changed since.</DialogDescription>
        </DialogHeader>
        {!invoice ? (
          <p className="text-sm text-muted-foreground">{invoiceQuery.isError ? "Couldn't load the invoice." : "Loading..."}</p>
        ) : (
          <>
            <A4Preview>
              <InvoiceDocument invoice={invoice} />
            </A4Preview>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print invoice
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
          <DialogTitle>Invoice a past sale</DialogTitle>
          <DialogDescription>
            Recent sales at {storeName ?? "this store"}. Switch store at the top to see another store's sales.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Sale</Label>
          <Select value={saleId} onValueChange={setSaleId}>
            <SelectTrigger>
              <SelectValue placeholder={salesQuery.isLoading ? "Loading..." : "Choose a sale"} />
            </SelectTrigger>
            <SelectContent>
              {sales.map((sale) => (
                <SelectItem key={sale.id} value={sale.id}>
                  {new Date(sale.createdAt).toLocaleString()} · {sale.receiptNumber} · {money(sale.total)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {salesQuery.isSuccess && sales.length === 0 && (
            <p className="text-sm text-muted-foreground">No sales at this store yet.</p>
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
          Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesPage() {
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
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            A4 invoices issued at checkout. {data ? `${data.total} in total.` : ""}
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)}>
          <FilePlus className="mr-2 h-4 w-4" /> Invoice a past sale
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Bill to</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(inv.issuedAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {inv.buyerName}
                    {inv.buyerTaxId && <span className="block text-xs text-muted-foreground">{inv.buyerTaxId}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{inv.sale.receiptNumber}</TableCell>
                  <TableCell className="text-right">{money(inv.sale.total)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setViewing(inv.id)}>
                      View / print
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    No invoices yet. Issue one from the POS after a sale ("A4 invoice"), or for a past sale here.
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
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
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
