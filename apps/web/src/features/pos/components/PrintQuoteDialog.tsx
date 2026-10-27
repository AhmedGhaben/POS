import * as React from "react";
import { FileCheck, Printer } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { countryConfig, type CustomerDto, type DiscountInput, type StoreDto } from "@pos/shared";
import { BANK_ACCOUNTS_QUERY_KEY, fetchBankAccounts } from "@/features/business/api";
import { createProforma } from "@/features/fiscal/api";
import { isWorkingOffline } from "@/features/pos/offline-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrintArea, type PrintFormat } from "@/components/print/PrintArea";
import { A4Document } from "@/features/documents/components/A4Document";
import { QuoteSlip } from "@/features/documents/components/QuoteSlip";
import { linesFromCart, quoteReference } from "@/features/documents/lines";
import { printDocument } from "@/features/desktop/printing";
import type { CartLine } from "@/features/pos/hooks/useCart";
import { useDocumentLanguage } from "@/i18n/use-document-language";

interface PrintQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartLine[];
  saleDiscount?: DiscountInput | null;
  store: StoreDto | undefined;
  customer: CustomerDto | null;
  /** A proforma was saved (numbered and signed): show it. */
  onProforma?: (documentId: string) => void;
}

/** Scale of the A4 on-screen preview (210 mm ≈ 794 px). */
const A4_PREVIEW_SCALE = 0.55;

/**
 * Prints the cart as a quote without creating a sale, taking payment or
 * touching stock. Nothing is saved, so it works offline.
 */
export function PrintQuoteDialog({ open, onOpenChange, lines, saleDiscount = null, store, customer, onProforma }: PrintQuoteDialogProps) {
  const { t } = useTranslation("pos");
  // The printed quote is for the customer: business language.
  const doc = useDocumentLanguage();
  const [format, setFormat] = React.useState<PrintFormat>("receipt");
  const [forName, setForName] = React.useState("");
  const [issuedAt, setIssuedAt] = React.useState(() => new Date());

  // A fresh timestamp and reference every time the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setIssuedAt(new Date());
    setForName(customer?.name ?? "");
    setValidDays("30");
  }, [open, customer]);

  // How many days a saved proforma is valid ("Válida até" on it).
  const [validDays, setValidDays] = React.useState("30");
  const validDaysOk = Number.isInteger(Number(validDays)) && Number(validDays) >= 1 && Number(validDays) <= 365;
  const docLines = React.useMemo(() => linesFromCart(lines, saleDiscount), [lines, saleDiscount]);
  // Where sales are fiscal documents a quote can be kept as a Factura Pró-forma
  // (numbered and signed on the server), and sold from later.
  const fiscal = !!countryConfig(store?.country ?? null) && !isWorkingOffline();
  const proformaMutation = useMutation({
    mutationFn: () =>
      createProforma({
        storeId: store!.id,
        customerId: customer && !customer.isFinalConsumer ? customer.id : undefined,
        lineItems: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPrice: l.unitPrice ?? undefined, discount: l.discount ?? null })),
        discount: saleDiscount,
        validDays: Number(validDays) || 30,
      }),
    onSuccess: (document) => {
      onOpenChange(false);
      onProforma?.(document.id);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  // A quote isn't stored: it shows the bank accounts as they're set now.
  const bankAccounts = useQuery({ queryKey: BANK_ACCOUNTS_QUERY_KEY, queryFn: fetchBankAccounts, enabled: open, staleTime: 5 * 60_000 });
  const quoteAccounts = (bankAccounts.data ?? []).filter((a) => a.showOnQuotes);
  const reference = quoteReference(store?.id ?? "0000", issuedAt);
  const name = forName.trim() || undefined;
  const date = doc.date(issuedAt);

  const slip = <QuoteSlip store={store} lines={docLines} reference={reference} issuedAt={issuedAt} forName={name} />;
  const a4 = (
    <A4Document
      title={doc.t("quote.a4Title")}
      meta={[
        [doc.t("quote.reference"), reference],
        [doc.t("quote.date"), date],
      ]}
      store={store}
      lines={docLines}
      bankAccounts={quoteAccounts}
      billTo={name ? { name, email: customer?.name === name ? customer.email : null } : null}
      notes={
        <p className="text-[9pt] text-neutral-700">
          {doc.t("quote.a4Notes", { date })}
        </p>
      }
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("quote.title")}</DialogTitle>
          <DialogDescription>{t("quote.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <Tabs value={format} onValueChange={(v) => setFormat(v as PrintFormat)}>
            <TabsList>
              <TabsTrigger value="receipt">{t("quote.smallSlip")}</TabsTrigger>
              <TabsTrigger value="a4">{t("quote.a4")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="quote-for">{t("quote.forLabel")}</Label>
            <Input
              id="quote-for"
              placeholder={t("quote.forPlaceholder")}
              value={forName}
              onChange={(e) => setForName(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-md border bg-muted/40 p-3">
          {format === "receipt" ? (
            <div className="bg-white py-3 text-black">{slip}</div>
          ) : (
            <div style={{ height: `${297 * A4_PREVIEW_SCALE}mm`, width: `${210 * A4_PREVIEW_SCALE}mm` }} className="mx-auto">
              <div className="origin-top-left shadow" style={{ transform: `scale(${A4_PREVIEW_SCALE})` }}>
                {a4}
              </div>
            </div>
          )}
        </div>

        <Button onClick={() => void printDocument()} disabled={lines.length === 0}>
          <Printer className="mr-2 h-4 w-4" /> {format === "receipt" ? t("quote.printSlip") : t("quote.printA4")}
        </Button>
        {fiscal && store && (
          <div className="flex items-end gap-2">
            <div className="w-36 space-y-1">
              <Label htmlFor="quote-valid-days">{t("quote.validDays")}</Label>
              <Input id="quote-valid-days" type="number" min={1} max={365} step={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} />
            </div>
            <Button
              variant="outline"
              className="flex-1"
              disabled={lines.length === 0 || proformaMutation.isPending || !validDaysOk}
              onClick={() => proformaMutation.mutate()}
            >
              <FileCheck className="mr-2 h-4 w-4" /> {t("quote.saveProforma")}
            </Button>
          </div>
        )}

        {open && <PrintArea format={format}>{format === "receipt" ? slip : a4}</PrintArea>}
      </DialogContent>
    </Dialog>
  );
}
