import { SaleStatus } from "@pos/shared";
import type { CreateCustomerDto, CreateSaleDto, CustomerDto, ProductDto, SaleDto, VoidReason, VoidSaleDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { useDeviceStore } from "@/features/desktop/bridge";
import { useShiftStore } from "@/features/shifts/shift-store";
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
    // Uploaded later with the till's key, it stays this person's sale.
    actingUserId: useAuthStore.getState().user?.id,
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
      discount: l.discount ?? undefined,
    })),
  };
  const receipt = { ...buildOfflineSale(sale.clientId!, payload, lines), ...currentCashier() };
  await addToOutbox({ clientId: sale.clientId!, kind: "sale", payload, createdAt, receipt });
  await useOfflineStore.getState().refreshPendingCount();
  return receipt;
}

function currentCashier(): Pick<SaleDto, "cashierId" | "cashier"> {
  const user = useAuthStore.getState().user;
  return user
    ? { cashierId: user.id, cashier: { id: user.id, firstName: user.firstName, lastName: user.lastName } }
    : { cashierId: "" };
}

/** This store's latest sales on the server, newest first. */
export function fetchRecentSales(storeId: string) {
  return apiClient.get<SaleDto[]>(`/sales/store/${storeId}`);
}

/**
 * Cancels a sale. Online, the server does it straight away. Offline, or for
 * a sale still waiting to upload, the cancel waits in the outbox behind the
 * sale and the till shows the sale as cancelled meanwhile.
 */
export async function voidSale(
  sale: SaleDto,
  reason: VoidReason,
  note?: string,
): Promise<{ sale: SaleDto; queued: boolean }> {
  const base: VoidSaleDto = {
    storeId: sale.storeId,
    reason,
    note: note?.trim() || undefined,
    actingUserId: useAuthStore.getState().user?.id,
  };

  const queue = async () => {
    const occurredAt = new Date().toISOString();
    const clientId = crypto.randomUUID();
    await addToOutbox({
      clientId,
      kind: "void-sale",
      createdAt: occurredAt,
      // By the till's own key when there is one: the sale may not have
      // reached the server yet.
      payload: { ...base, occurredAt, ...(sale.clientId ? { saleClientId: sale.clientId } : { saleId: sale.id }) },
    });
    await useOfflineStore.getState().refreshPendingCount();
    const { cashier } = currentCashier();
    return {
      sale: { ...sale, status: SaleStatus.VOIDED, voidedAt: occurredAt, voidReason: reason, voidNote: base.note ?? null, voidedBy: cashier ?? null },
      queued: true,
    };
  };

  const result = await (async () => {
    if (sale.queued || isWorkingOffline()) return queue();
    try {
      const voided = await apiClient.post<SaleDto>("/sales/void", { ...base, saleId: sale.id }, { timeoutMs: SALE_TIMEOUT_MS });
      return { sale: voided, queued: false };
    } catch (err) {
      if (isRetryableError(err) || (err instanceof ApiError && err.status === 401)) return queue();
      throw err;
    }
  })();
  // Out of the open shift's expected cash too.
  useShiftStore.getState().recordVoid(sale.clientId ?? sale.id);
  return result;
}

export function searchCustomers(search: string) {
  return apiClient.get<CustomerDto[]>(`/customers?search=${encodeURIComponent(search)}`);
}

export function createCustomer(dto: CreateCustomerDto) {
  return apiClient.post<CustomerDto>("/customers", dto);
}
