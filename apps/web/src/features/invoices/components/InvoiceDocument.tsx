import type { InvoiceDto } from "@pos/shared";
import { A4Document } from "@/features/documents/components/A4Document";
import { linesFromSale } from "@/features/documents/lines";
import { useDocumentLanguage } from "@/i18n/use-document-language";

/** An issued invoice, rendered from its stored snapshot: never from current settings. */
export function InvoiceDocument({ invoice }: { invoice: InvoiceDto }) {
  const { sale, seller } = invoice;
  const { t, money, longDate } = useDocumentLanguage(seller.currency);
  const payments =
    sale.payments.length > 0 ? sale.payments : [{ id: "legacy", method: sale.paymentMethod, amount: sale.total }];

  return (
    <A4Document
      title={t("invoice.title")}
      meta={[
        [t("invoice.number"), invoice.number],
        [t("invoice.date"), longDate(invoice.issuedAt)],
        [t("invoice.saleDate"), longDate(sale.createdAt)],
        [t("invoice.receiptNumber"), sale.receiptNumber],
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
          <p className="font-semibold">{t("invoice.paidInFull")}</p>
          <p className="text-neutral-700">
            {payments
              .map((p) => `${t(`common:paymentMethods.${p.method}`)} ${money(p.amount)}`)
              .join(" · ")}
          </p>
        </div>
      }
    />
  );
}
