import type { AdjustStockDto, InventoryItemDto, StockAtDateRowDto, StockMovementDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";
import type { StockCountInputDto, StockCountPreviewRowDto } from "@pos/shared";

export function createStockCount(storeId: string, dto: StockCountInputDto) {
  return apiClient.post<{ id: string; changed: number }>(`/stores/${storeId}/inventory/counts`, dto);
}

export function previewStockCount(storeId: string, fileName: string, dataUrl: string) {
  return apiClient.post<{ rows: StockCountPreviewRowDto[] }>(`/stores/${storeId}/inventory/counts/preview`, { fileName, dataUrl });
}

export function fetchInventory(storeId: string) {
  return apiClient.get<InventoryItemDto[]>(`/stores/${storeId}/inventory`);
}

export function adjustStock(storeId: string, productId: string, dto: AdjustStockDto) {
  return apiClient.put<InventoryItemDto>(`/stores/${storeId}/inventory/${productId}`, dto);
}

/** Stock and book value at the end of a day (YYYY-MM-DD), e.g. 31 December for the yearly inventory. */
export function fetchStockAt(storeId: string, date: string) {
  return apiClient.get<StockAtDateRowDto[]>(`/stores/${storeId}/inventory/at?date=${encodeURIComponent(date)}`);
}

/** A product's stock history in a store, newest first. */
export function fetchStockMovements(storeId: string, productId: string) {
  return apiClient.get<StockMovementDto[]>(`/stores/${storeId}/inventory/${productId}/movements`);
}

/** The last 31 December, for the yearly inventory. */
export function lastYearEnd(today = new Date()): string {
  return `${today.getFullYear() - 1}-12-31`;
}
