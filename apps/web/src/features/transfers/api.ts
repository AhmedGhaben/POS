import type { CreateTransferDto, StockTransferDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchTransfers(storeId: string) {
  return apiClient.get<StockTransferDto[]>(`/transfers/store/${storeId}`);
}

export function createTransfer(dto: CreateTransferDto) {
  return apiClient.post<StockTransferDto>("/transfers", dto);
}
