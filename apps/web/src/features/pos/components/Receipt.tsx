import { PaymentMethod } from "@pos/shared";
import type { CustomerDto, SaleDto } from "@pos/shared";

interface ReceiptProps {
  sale: SaleDto;
  storeName: string;
  /** Passed from POS checkout state rather than round-tripped through the
   * API — the receipt only needs the name for this same-session display. */
  customer?: CustomerDto | null;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Cash",
  [PaymentMethod.CARD]: "Card",
  [PaymentMethod.MOBILE_MONEY]: "Mobile money",
  [PaymentMethod.OTHER]: "Other",
};

/** Print-optimized layout — see @media print rules in styles/globals.css. */
export function Receipt({ sale, storeName, customer }: ReceiptProps) {
  const changeDue = sale.changeDue !== null ? Number(sale.changeDue) : null;
  // Pre-migration sales have no payments rows; fall back to the legacy single-method field.
  const payments =
    sale.payments.length > 0
      ? sale.payments
      : [{ id: "legacy", method: sale.paymentMethod, amount: sale.total, tendered: null, change: null }];

  return (
    <div id="printable-receipt" className="mx-auto w-[300px] font-mono text-xs">
      <p className="text-center text-sm font-semibold">{storeName}</p>
      <p className="text-center">{new Date(sale.createdAt).toLocaleString()}</p>
      <p className="text-center">Receipt #{sale.receiptNumber}</p>
      {customer && <p className="text-center">{customer.name}</p>}
      <hr className="my-2 border-dashed" />
      {sale.lineItems.map((line) => (
        <div key={line.id} className="flex justify-between">
          <span>
            {line.quantity} x {line.product.name}
          </span>
          <span>${Number(line.lineTotal).toFixed(2)}</span>
        </div>
      ))}
      <hr className="my-2 border-dashed" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>${Number(sale.subtotal).toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Tax</span>
        <span>${Number(sale.taxTotal).toFixed(2)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>${Number(sale.total).toFixed(2)}</span>
      </div>
      <hr className="my-2 border-dashed" />
      {payments.map((payment, i) => (
        <div key={payment.id ?? i} className="flex justify-between">
          <span>{PAYMENT_LABELS[payment.method]}</span>
          <span>${Number(payment.amount).toFixed(2)}</span>
        </div>
      ))}
      {sale.amountTendered !== null && (
        <div className="flex justify-between">
          <span>Tendered</span>
          <span>${Number(sale.amountTendered).toFixed(2)}</span>
        </div>
      )}
      {changeDue !== null && changeDue > 0 && (
        <div className="flex justify-between">
          <span>Change due</span>
          <span>${changeDue.toFixed(2)}</span>
        </div>
      )}
      <p className="mt-2 text-center">Thank you!</p>
    </div>
  );
}
