import type { CreateProductDto, ProductDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchProducts(search?: string, categoryId?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);
  const query = params.toString();
  return apiClient.get<ProductDto[]>(`/products${query ? `?${query}` : ""}`);
}

export function createProduct(dto: CreateProductDto) {
  return apiClient.post<ProductDto>("/products", dto);
}
