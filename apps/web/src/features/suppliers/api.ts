import type { CreateSupplierDto, SupplierDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchSuppliers() {
  return apiClient.get<SupplierDto[]>("/suppliers");
}

export function createSupplier(dto: CreateSupplierDto) {
  return apiClient.post<SupplierDto>("/suppliers", dto);
}
