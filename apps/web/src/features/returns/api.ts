import type { CreateReturnDto, ReturnDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchReturns(storeId: string) {
  return apiClient.get<ReturnDto[]>(`/returns/store/${storeId}`);
}

/** headers: a manager's approval (X-Override-Token) for someone without PROCESS_RETURN. */
export function createReturn(dto: CreateReturnDto, headers?: Record<string, string>) {
  return apiClient.post<ReturnDto>("/returns", dto, { headers });
}
