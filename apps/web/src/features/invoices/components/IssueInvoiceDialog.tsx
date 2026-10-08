import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { CustomerDto, InvoiceDto, SaleDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintArea } from "@/components/print/PrintArea";
import { issueInvoice } from "@/features/invoices/api";
import { A4Preview } from "./A4Preview";
import { InvoiceDocument } from "./InvoiceDocument";

interface IssueInvoiceDialogProps {
  sale: SaleDto | null;
  customer: CustomerDto | null;
  onClose: () => void;
}

const EMPTY = { buyerName: "", buyerAddress: "", buyerTaxId: "", buyerEmail: "" };

/**
 * Buyer details → issue (numbered by the server) → preview and print.
 * Issuing twice for the same sale returns the same invoice.
 */
export function IssueInvoiceDialog({ sale, customer, onClose }: IssueInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState(EMPTY);
  const [saveToCustomer, setSaveToCustomer] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invoice, setInvoice] = React.useState<InvoiceDto | null>(null);
  const isOffline = sale?.receiptNumber.startsWith("OFFLINE-") ?? false;

  React.useEffect(() => {
    if (!sale) return;
    setInvoice(null);
    setError(null);
    setForm({
      buyerName: customer?.name ?? "",
      buyerAddress: customer?.address ?? "",
      buyerTaxId: customer?.taxId ?? "",
      buyerEmail: customer?.email ?? "",
    });
  }, [sale, customer]);

  const mutation = useMutation({
    mutationFn: () =>
      issueInvoice(sale!.id, {
        ...form,
        saveToCustomer: customer ? saveToCustomer : undefined,
      }),
    onSuccess: (issued) => {
      setInvoice(issued);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      if (customer && saveToCustomer) queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.buyerName.trim()) return setError("Enter the buyer's name or company");
    setError(null);
    mutation.mutate();
  }

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={!!sale} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{invoice ? `Invoice ${invoice.number}` : "A4 invoice"}</DialogTitle>
          <DialogDescription>
            {invoice
              ? "Issued. Print it, or choose \"Save as PDF\" in the print window to email it."
              : `For receipt ${sale?.receiptNumber ?? ""}. The invoice number is assigned when you continue.`}
          </DialogDescription>
        </DialogHeader>

        {isOffline ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
            This sale was saved offline. Invoices are numbered by the server, so issue one once it has synced:
            Invoices → "Invoice a past sale".
          </p>
        ) : invoice ? (
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
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="buyer-name">Bill to (name or company)</Label>
              <Input id="buyer-name" value={form.buyerName} onChange={set("buyerName")} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer-address">Address</Label>
              <Textarea id="buyer-address" rows={2} value={form.buyerAddress} onChange={set("buyerAddress")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="buyer-tax">Tax / VAT number</Label>
                <Input id="buyer-tax" value={form.buyerTaxId} onChange={set("buyerTaxId")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyer-email">Email</Label>
                <Input id="buyer-email" type="email" value={form.buyerEmail} onChange={set("buyerEmail")} />
              </div>
            </div>
            {customer && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={saveToCustomer}
                  onChange={(e) => setSaveToCustomer(e.target.checked)}
                />
                Save these details to {customer.name} for next time
              </label>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Issuing..." : "Issue invoice"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
