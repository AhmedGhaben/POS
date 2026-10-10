import * as React from "react";
import { Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CustomerDto, StoreDto } from "@pos/shared";
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
  store: StoreDto | undefined;
  customer: CustomerDto | null;
}

/** Scale of the A4 on-screen preview (210 mm ≈ 794 px). */
const A4_PREVIEW_SCALE = 0.55;

/**
 * Prints the cart as a quote without creating a sale, taking payment or
 * touching stock. Nothing is saved, so it works offline.
 */
export function PrintQuoteDialog({ open, onOpenChange, lines, store, customer }: PrintQuoteDialogProps) {
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
  }, [open, customer]);

  const docLines = React.useMemo(() => linesFromCart(lines), [lines]);
  const reference = quoteReference(store?.id ?? "0000", issuedAt);
  const name = forName.trim() || undefined;
  const date = doc.longDate(issuedAt);

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

        {open && <PrintArea format={format}>{format === "receipt" ? slip : a4}</PrintArea>}
      </DialogContent>
    </Dialog>
  );
}
