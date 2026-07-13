import type { AdjustStockDto, InventoryItemDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchInventory(storeId: string) {
  return apiClient.get<InventoryItemDto[]>(`/stores/${storeId}/inventory`);
}

export function adjustStock(storeId: string, productId: string, dto: AdjustStockDto) {
  return apiClient.put<InventoryItemDto>(`/stores/${storeId}/inventory/${productId}`, dto);
}
