import type { PagedDto, SaleDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchSalesByStore(storeId: string) {
  return apiClient.get<SaleDto[]>(`/sales/store/${storeId}`);
}

export interface SalesFilter {
  storeId: string;
  /** Calendar dates (YYYY-MM-DD), the store's days. */
  from?: string;
  to?: string;
  /** COMPLETED, VOIDED or CREDIT (on a customer's account). */
  status?: string;
  search?: string;
  take: number;
  skip: number;
}

/** Sales history (back office), newest first. */
export function fetchSalesHistory(f: SalesFilter) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") params.set(k, String(v));
  return apiClient.get<Pick<PagedDto<SaleDto>, "items" | "total">>(`/sales?${params}`);
}
