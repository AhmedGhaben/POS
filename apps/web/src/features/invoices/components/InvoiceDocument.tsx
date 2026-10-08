import type { InvoiceDto } from "@pos/shared";
import { A4Document } from "@/features/documents/components/A4Document";
import { linesFromSale } from "@/features/documents/lines";
import { PAYMENT_LABELS } from "@/features/documents/payment-labels";
import { formatMoney } from "@/lib/format";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** An issued invoice, rendered from its stored snapshot: never from current settings. */
export function InvoiceDocument({ invoice }: { invoice: InvoiceDto }) {
  const { sale, seller } = invoice;
  const payments =
    sale.payments.length > 0 ? sale.payments : [{ id: "legacy", method: sale.paymentMethod, amount: sale.total }];

  return (
    <A4Document
      title="INVOICE"
      meta={[
        ["Invoice no.", invoice.number],
        ["Invoice date", longDate(invoice.issuedAt)],
        ["Sale date", longDate(sale.createdAt)],
        ["Receipt no.", sale.receiptNumber],
      ]}
      seller={seller}
      store={seller.store}
      lines={linesFromSale(sale.lineItems)}
      billTo={{
        name: invoice.buyerName,
        address: invoice.buyerAddress,
        taxId: invoice.buyerTaxId,
        email: invoice.buyerEmail,
      }}
      notes={
        <div className="text-[9pt]">
          <p className="font-semibold">Paid in full</p>
          <p className="text-neutral-700">
            {payments
              .map((p) => `${PAYMENT_LABELS[p.method]} ${formatMoney(p.amount, seller.currency)}`)
              .join(" · ")}
          </p>
        </div>
      }
    />
  );
}
