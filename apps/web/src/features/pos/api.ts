import type { CreateCustomerDto, CreateSaleDto, CustomerDto, ProductDto, SaleDto } from "@pos/shared";
import { apiClient, ApiError } from "@/lib/api-client";
import { enqueuePendingSale } from "@/lib/offline-db";
import type { CartLine } from "./hooks/useCart";
import { buildOfflineSale } from "./offline-sale";
import { useOfflineStore } from "./offline-store";

export async function findByBarcode(barcode: string): Promise<ProductDto | null> {
  try {
    return await apiClient.get<ProductDto>(`/products/barcode/${encodeURIComponent(barcode)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * `lines` (the cart's product/quantity pairs) is only used to build a
 * client-side receipt if the sale has to be queued offline — the request
 * itself only needs `dto`.
 */
export async function createSale(dto: CreateSaleDto, lines: CartLine[]): Promise<SaleDto> {
  if (!navigator.onLine) {
    return queueSaleOffline(dto, lines);
  }
  try {
    return await apiClient.post<SaleDto>("/sales", dto);
  } catch (err) {
    // A reachable server that rejected the sale (e.g. insufficient stock) is
    // a real error — only a network-level failure should queue it offline.
    if (err instanceof ApiError) {
      throw err;
    }
    return queueSaleOffline(dto, lines);
  }
}

async function queueSaleOffline(dto: CreateSaleDto, lines: CartLine[]): Promise<SaleDto> {
  const pending = await enqueuePendingSale(dto);
  await useOfflineStore.getState().refreshPendingCount();
  return buildOfflineSale(pending.localId, dto, lines);
}

export function searchCustomers(search: string) {
  return apiClient.get<CustomerDto[]>(`/customers?search=${encodeURIComponent(search)}`);
}

export function createCustomer(dto: CreateCustomerDto) {
  return apiClient.post<CustomerDto>("/customers", dto);
}
