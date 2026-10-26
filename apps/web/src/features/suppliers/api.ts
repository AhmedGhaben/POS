import type { CreateSupplierDto, SupplierDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

/** Active suppliers; archived ones too when asked (to look up past purchases). */
export function fetchSuppliers(includeArchived = false) {
  return apiClient.get<SupplierDto[]>(`/suppliers${includeArchived ? "?includeArchived=true" : ""}`);
}

/** Only a supplier with no purchases or payments; others are archived. */
export function deleteSupplier(id: string) {
  return apiClient.delete<void>(`/suppliers/${id}`);
}

export function createSupplier(dto: CreateSupplierDto) {
  return apiClient.post<SupplierDto>("/suppliers", dto);
}
