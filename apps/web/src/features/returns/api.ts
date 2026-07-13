import type { CreateReturnDto, ReturnDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchReturns(storeId: string) {
  return apiClient.get<ReturnDto[]>(`/returns/store/${storeId}`);
}

export function createReturn(dto: CreateReturnDto) {
  return apiClient.post<ReturnDto>("/returns", dto);
}
