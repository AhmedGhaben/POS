import type { CreateCustomerDto, CreateSaleDto, CustomerDto, ProductDto, SaleDto } from "@pos/shared";
import { useDeviceStore } from "@/features/desktop/bridge";
import { apiClient, ApiError, isRetryableError, isUnreachableError } from "@/lib/api-client";
import { addToOutbox } from "@/lib/offline-db";
import { findSavedByBarcode } from "./catalog";
import type { CartLine } from "./hooks/useCart";
import { buildOfflineSale } from "./offline-sale";
import { isWorkingOffline, useOfflineStore } from "./offline-store";

/** Long enough for a slow connection, short enough not to hold up a queue. */
const SALE_TIMEOUT_MS = 8_000;

export async function findByBarcode(barcode: string): Promise<ProductDto | null> {
  if (isWorkingOffline()) return findSavedByBarcode(barcode);
  try {
    return await apiClient.get<ProductDto>(`/products/barcode/${encodeURIComponent(barcode)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    if (isUnreachableError(err)) return findSavedByBarcode(barcode);
    throw err;
  }
}

/**
 * Completes a sale. Tries the server first (unless the till already knows
 * it's offline); if the server can't be reached, errors, times out, or the
 * session has lapsed, the sale goes into the local outbox instead and the
 * cashier carries on. Only a real rejection (bad stock, bad payment) is
 * shown as an error. `lines` builds the local receipt for a queued sale.
 */
export async function createSale(dto: CreateSaleDto, lines: CartLine[]): Promise<SaleDto> {
  const sale: CreateSaleDto = {
    ...dto,
    // One key for every attempt at this sale, online or later from the queue.
    clientId: crypto.randomUUID(),
    terminalId: useDeviceStore.getState().terminal?.id,
  };
  if (isWorkingOffline()) {
    return queueSaleOffline(sale, lines);
  }
  try {
    return await apiClient.post<SaleDto>("/sales", sale, { timeoutMs: SALE_TIMEOUT_MS });
  } catch (err) {
    if (isRetryableError(err) || (err instanceof ApiError && err.status === 401)) {
      return queueSaleOffline(sale, lines);
    }
    throw err;
  }
}

async function queueSaleOffline(sale: CreateSaleDto, lines: CartLine[]): Promise<SaleDto> {
  const createdAt = new Date().toISOString();
  const payload: CreateSaleDto = {
    ...sale,
    offline: { createdAt },
    // The server records these prices, not whatever they are by sync time.
    lineItems: lines.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity,
      unitPrice: Number(l.product.sellPrice),
      taxRate: Number(l.product.taxRate),
    })),
  };
  await addToOutbox({ clientId: sale.clientId!, kind: "sale", payload, createdAt });
  await useOfflineStore.getState().refreshPendingCount();
  return buildOfflineSale(sale.clientId!, payload, lines);
}

export function searchCustomers(search: string) {
  return apiClient.get<CustomerDto[]>(`/customers?search=${encodeURIComponent(search)}`);
}

export function createCustomer(dto: CreateCustomerDto) {
  return apiClient.post<CustomerDto>("/customers", dto);
}
