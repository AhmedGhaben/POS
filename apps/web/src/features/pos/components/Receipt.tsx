import { fromCents, lineGrossCents, SaleStatus, type CustomerDto, type SaleDto, type StoreDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { SlipHeader } from "@/features/documents/components/SlipHeader";
import { useDocumentLanguage } from "@/i18n/use-document-language";
import { discountLabel } from "../discount-label";
import { ReceiptFiscalBottom, ReceiptFiscalTop } from "@/features/fiscal/components/ReceiptFiscal";
import { saleDocument } from "@/features/fiscal/sale-document";

interface ReceiptProps {
  sale: SaleDto;
  store: StoreDto | undefined;
  /** Passed from POS checkout state rather than round-tripped through the
   * API — the receipt only needs the name for this same-session display. */
  customer?: CustomerDto | null;
  /** A reprint: marked COPY so it can't pass for a second sale. */
  copy?: boolean;
}


/** 80 mm slip, in the business language. Shown as a preview on screen; wrap a copy in <PrintArea> to print it. */
export function Receipt({ sale, store, customer, copy }: ReceiptProps) {
  const { t, money, qty, dateTime } = useDocumentLanguage();
  const business = useAuthStore((s) => s.business);
  const changeDue = sale.changeDue !== null ? Number(sale.changeDue) : null;
  const saleDiscount = Number(sale.saleDiscountAmount ?? 0);
  // Pre-migration sales have no payments rows; fall back to the legacy single-method field.
  const payments =
    sale.payments.length > 0
      ? sale.payments
      : [{ id: "legacy", method: sale.paymentMethod, amount: sale.total, tendered: null, change: null }];

  return (
    <div className="receipt-slip mx-auto w-[300px] font-mono text-xs">
      <SlipHeader store={store} />
      <hr className="my-2 border-dashed" />
      {sale.status === SaleStatus.VOIDED && (
        <div className="mb-2 text-center">
          <p className="text-base font-bold">*** {t("receipt.cancelled")} ***</p>
          {sale.voidReason && <p>{t(`common:voidReasons.${sale.voidReason}`)}</p>}
          {sale.voidedAt && <p>{dateTime(sale.voidedAt)}</p>}
        </div>
      )}
      {copy && <p className="text-center font-bold">{t("receipt.copy")}</p>}
      <ReceiptFiscalTop sale={sale} customer={customer} />
      <p className="text-center">{dateTime(sale.createdAt)}</p>
      <p className="text-center">{t("receipt.number", { number: sale.receiptNumber })}</p>
      {customer && !saleDocument(sale) && <p className="text-center">{customer.name}</p>}
      <hr className="my-2 border-dashed" />
      {sale.lineItems.map((line) => {
        const lineDiscount = Number(line.lineDiscountAmount ?? 0);
        return (
          <div key={line.id}>
            <div className="flex justify-between">
              <span>
                {qty(line.quantity, line.unit)} x {line.product.name}
              </span>
              <span>{money(fromCents(lineGrossCents(Number(line.unitPrice), Number(line.quantity))))}</span>
            </div>
            {line.unit && line.unit !== "un" && (
              <div className="pl-3">{t("receipt.perUnit", { price: money(line.unitPrice), unit: line.unit })}</div>
            )}
            {lineDiscount > 0 && (
              <div className="flex justify-between pl-3">
                <span>
                  {t("totals.discount")}
                  {line.discountType === "PERCENT" && line.discountValue && ` ${discountLabel({ type: "PERCENT", value: line.discountValue }, money)}`}
                </span>
                <span>-{money(lineDiscount)}</span>
              </div>
            )}
          </div>
        );
      })}
      <hr className="my-2 border-dashed" />
      <div className="flex justify-between">
        <span>{t("totals.subtotal")}</span>
        <span>{money(Number(sale.subtotal) - (Number(sale.discountTotal) - saleDiscount))}</span>
      </div>
      {saleDiscount > 0 && (
        <div className="flex justify-between">
          <span>
            {t("totals.saleDiscount")}
            {sale.discountType === "PERCENT" && sale.discountValue && ` ${discountLabel({ type: "PERCENT", value: sale.discountValue }, money)}`}
          </span>
          <span>-{money(saleDiscount)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>{sale.pricesIncludeTax ? t("totals.taxIncluded") : t("totals.tax")}</span>
        <span>{money(sale.taxTotal)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>{t("totals.total")}</span>
        <span>{money(sale.total)}</span>
      </div>
      <hr className="my-2 border-dashed" />
      {payments.map((payment, i) => (
        <div key={payment.id ?? i} className="flex justify-between">
          <span>{t(`common:paymentMethods.${payment.method}`)}</span>
          <span>{money(payment.amount)}</span>
        </div>
      ))}
      {sale.amountTendered !== null && (
        <div className="flex justify-between">
          <span>{t("receipt.tendered")}</span>
          <span>{money(sale.amountTendered)}</span>
        </div>
      )}
      {changeDue !== null && changeDue > 0 && (
        <div className="flex justify-between">
          <span>{t("receipt.changeDue")}</span>
          <span>{money(changeDue)}</span>
        </div>
      )}
      {Number(sale.discountTotal) > 0 && (
        <p className="mt-2 text-center">{t("receipt.saved", { amount: money(sale.discountTotal) })}</p>
      )}
      <ReceiptFiscalBottom sale={sale} />
      <p className="mt-2 whitespace-pre-line text-center">{business?.receiptFooter || t("receipt.thankYou")}</p>
    </div>
  );
}
