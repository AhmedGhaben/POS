import type { SaleDto } from "@pos/shared";

interface ReceiptProps {
  sale: SaleDto;
  storeName: string;
}

/** Print-optimized layout — see @media print rules in styles/globals.css. */
export function Receipt({ sale, storeName }: ReceiptProps) {
  return (
    <div id="printable-receipt" className="mx-auto w-[300px] font-mono text-xs">
      <p className="text-center text-sm font-semibold">{storeName}</p>
      <p className="text-center">{new Date(sale.createdAt).toLocaleString()}</p>
      <p className="text-center">Receipt #{sale.receiptNumber}</p>
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
      <p className="mt-2 text-center">Paid via {sale.paymentMethod}</p>
      <p className="mt-2 text-center">Thank you!</p>
    </div>
  );
}
