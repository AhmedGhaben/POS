import { PaymentMethod } from "@pos/shared";
import type { CustomerDto, SaleDto, StoreDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { logoSrc } from "@/features/business/api";
import { useMoney } from "@/features/business/use-money";

interface ReceiptProps {
  sale: SaleDto;
  store: StoreDto | undefined;
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

/** 80 mm slip. Shown as a preview on screen; wrap a copy in <PrintArea> to print it. */
export function Receipt({ sale, store, customer }: ReceiptProps) {
  const money = useMoney();
  const business = useAuthStore((s) => s.business);
  const logo = logoSrc(business);
  const storeName = store?.name ?? "Store";
  // Show the business name too when the store has its own (e.g. "Main Street").
  const businessName = business && business.name !== storeName ? business.name : null;
  const changeDue = sale.changeDue !== null ? Number(sale.changeDue) : null;
  // Pre-migration sales have no payments rows; fall back to the legacy single-method field.
  const payments =
    sale.payments.length > 0
      ? sale.payments
      : [{ id: "legacy", method: sale.paymentMethod, amount: sale.total, tendered: null, change: null }];

  return (
    <div className="mx-auto w-[300px] font-mono text-xs">
      {logo && (
        // Grayscale: thermal printers are monochrome, and colour logos dither badly.
        <img src={logo} alt="" className="mx-auto mb-1 max-h-16 max-w-[200px] object-contain grayscale" />
      )}
      {businessName && <p className="text-center text-sm font-semibold">{businessName}</p>}
      <p className={businessName ? "text-center" : "text-center text-sm font-semibold"}>{storeName}</p>
      {store?.address && <p className="whitespace-pre-line text-center">{store.address}</p>}
      {store?.phone && <p className="text-center">{store.phone}</p>}
      {business?.taxId && <p className="text-center">Tax ID: {business.taxId}</p>}
      {business?.receiptHeader && <p className="mt-1 whitespace-pre-line text-center">{business.receiptHeader}</p>}
      <hr className="my-2 border-dashed" />
      <p className="text-center">{new Date(sale.createdAt).toLocaleString()}</p>
      <p className="text-center">Receipt #{sale.receiptNumber}</p>
      {customer && <p className="text-center">{customer.name}</p>}
      <hr className="my-2 border-dashed" />
      {sale.lineItems.map((line) => (
        <div key={line.id} className="flex justify-between">
          <span>
            {line.quantity} x {line.product.name}
          </span>
          <span>{money(line.lineTotal)}</span>
        </div>
      ))}
      <hr className="my-2 border-dashed" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{money(sale.subtotal)}</span>
      </div>
      <div className="flex justify-between">
        <span>Tax</span>
        <span>{money(sale.taxTotal)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>{money(sale.total)}</span>
      </div>
      <hr className="my-2 border-dashed" />
      {payments.map((payment, i) => (
        <div key={payment.id ?? i} className="flex justify-between">
          <span>{PAYMENT_LABELS[payment.method]}</span>
          <span>{money(payment.amount)}</span>
        </div>
      ))}
      {sale.amountTendered !== null && (
        <div className="flex justify-between">
          <span>Tendered</span>
          <span>{money(sale.amountTendered)}</span>
        </div>
      )}
      {changeDue !== null && changeDue > 0 && (
        <div className="flex justify-between">
          <span>Change due</span>
          <span>{money(changeDue)}</span>
        </div>
      )}
      <p className="mt-2 whitespace-pre-line text-center">{business?.receiptFooter || "Thank you!"}</p>
    </div>
  );
}
