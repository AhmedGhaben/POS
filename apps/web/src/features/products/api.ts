import type { CreateProductDto, ProductDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchProducts(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiClient.get<ProductDto[]>(`/products${query}`);
}

export function createProduct(dto: CreateProductDto) {
  return apiClient.post<ProductDto>("/products", dto);
}
