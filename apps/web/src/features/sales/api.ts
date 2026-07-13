import type { SaleDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchSalesByStore(storeId: string) {
  return apiClient.get<SaleDto[]>(`/sales/store/${storeId}`);
}
