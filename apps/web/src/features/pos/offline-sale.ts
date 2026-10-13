import { PaymentMethod, SaleStatus } from "@pos/shared";
import type { CreateSaleDto, SaleDto, SaleLineItemDto, SalePaymentDto } from "@pos/shared";
import { linePrice, priceCart, type CartLine } from "./hooks/useCart";

/**
 * Receipt number for a sale rung up offline. Must match the API's
 * offlineReceiptNumber() (apps/api/src/sales/sales.service.ts): the server
 * stores the same number when the sale syncs, so the paper receipt can be
 * looked up later.
 */
export function offlineReceiptNumber(storeId: string, clientId: string): string {
  const store = storeId.slice(-4).toUpperCase();
  const client = clientId.replace(/-/g, "").slice(0, 12).toUpperCase();
  return `OFF-${store}-${client}`;
}

/**
 * Builds a SaleDto-shaped receipt entirely client-side, with the same
 * pricing as SalesService#create (shared priceSale), for the "queued while
 * offline" path — there's no server response yet, but the cashier still
 * needs a receipt to print/show. The server stores the real record when the
 * outbox syncs.
 */
export function buildOfflineSale(localId: string, dto: CreateSaleDto, lines: CartLine[]): SaleDto {
  const priced = priceCart(lines, dto.discount ?? null);
  const lineItems: SaleLineItemDto[] = lines.map((line, i) => {
    const p = priced.lines[i];
    return {
      id: `${localId}-${i}`,
      productId: line.product.id,
      product: line.product,
      quantity: line.quantity,
      unitPrice: linePrice(line).toFixed(2),
      taxAmount: p.tax.toFixed(2),
      discountAmount: p.discount.toFixed(2),
      lineTotal: p.total.toFixed(2),
      discountType: line.discount?.value ? line.discount.type : null,
      discountValue: line.discount?.value ? line.discount.value.toFixed(2) : null,
      lineDiscountAmount: p.lineDiscount.toFixed(2),
    };
  });

  const cashLegs = dto.payments
    .filter((p) => p.method === PaymentMethod.CASH)
    .map((p) => {
      const tendered = p.tendered ?? p.amount;
      return { tendered, change: tendered - p.amount };
    });
  const amountTendered = cashLegs.length > 0 ? cashLegs.reduce((sum, l) => sum + l.tendered, 0) : null;
  const changeDue = cashLegs.length > 0 ? cashLegs.reduce((sum, l) => sum + l.change, 0) : null;

  const payments: SalePaymentDto[] = dto.payments.map((p, i) => {
    if (p.method === PaymentMethod.CASH) {
      const tendered = p.tendered ?? p.amount;
      const change = tendered - p.amount;
      return {
        id: `${localId}-p${i}`,
        method: p.method,
        amount: p.amount.toFixed(2),
        tendered: tendered.toFixed(2),
        change: change.toFixed(2),
      };
    }
    return {
      id: `${localId}-p${i}`,
      method: p.method,
      amount: p.amount.toFixed(2),
      tendered: null,
      change: null,
    };
  });

  const saleDiscount = dto.discount?.value ? dto.discount : null;
  return {
    id: localId,
    storeId: dto.storeId,
    cashierId: "",
    customerId: dto.customerId ?? null,
    receiptNumber: offlineReceiptNumber(dto.storeId, localId),
    subtotal: priced.subtotal.toFixed(2),
    taxTotal: priced.taxTotal.toFixed(2),
    discountTotal: priced.discountTotal.toFixed(2),
    total: priced.total.toFixed(2),
    discountType: saleDiscount?.type ?? null,
    discountValue: saleDiscount ? saleDiscount.value.toFixed(2) : null,
    saleDiscountAmount: priced.saleDiscount.toFixed(2),
    paymentMethod: dto.payments[0].method,
    amountTendered: amountTendered !== null ? amountTendered.toFixed(2) : null,
    changeDue: changeDue !== null ? changeDue.toFixed(2) : null,
    status: SaleStatus.COMPLETED,
    createdAt: dto.offline?.createdAt ?? new Date().toISOString(),
    createdOffline: true,
    queued: true,
    clientId: localId,
    lineItems,
    payments,
  };
}
