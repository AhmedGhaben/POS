import type { CreatePurchaseDto, PurchaseDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchPurchases(storeId: string) {
  return apiClient.get<PurchaseDto[]>(`/purchases/store/${storeId}`);
}

export function createPurchase(dto: CreatePurchaseDto) {
  return apiClient.post<PurchaseDto>("/purchases", dto);
}
