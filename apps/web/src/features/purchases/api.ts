import type { CreatePurchaseDto, PagedDto, PurchaseDetailDto, PurchaseDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchPurchases(storeId: string) {
  return apiClient.get<PurchaseDto[]>(`/purchases/store/${storeId}`);
}

export function createPurchase(dto: CreatePurchaseDto) {
  return apiClient.post<PurchaseDto>("/purchases", dto);
}

export interface PurchasesFilter {
  storeId: string;
  supplierId?: string;
  paymentStatus?: string;
  search?: string;
  /** Calendar dates (YYYY-MM-DD), the store's days. */
  from?: string;
  to?: string;
  take: number;
  skip: number;
}

export function fetchPurchasePage(f: PurchasesFilter) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") params.set(k, String(v));
  return apiClient.get<Pick<PagedDto<PurchaseDto>, "items" | "total">>(`/purchases?${params}`);
}

export function fetchPurchase(id: string) {
  return apiClient.get<PurchaseDetailDto>(`/purchases/${id}`);
}
