import type { CreateProductDto, ProductDto, UpdateProductDto } from "@pos/shared";
import type { ImportRowPayload } from "./import-rows";
import { apiClient } from "@/lib/api-client";

/** `archived` lists archived products instead (owners and managers only). */
export function fetchProducts(search?: string, categoryId?: string, archived = false) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);
  if (archived) params.set("archived", "true");
  const query = params.toString();
  return apiClient.get<ProductDto[]>(`/products${query ? `?${query}` : ""}`);
}

export function createProduct(dto: CreateProductDto) {
  return apiClient.post<ProductDto>("/products", dto);
}

export function updateProduct(id: string, dto: UpdateProductDto) {
  return apiClient.patch<ProductDto>(`/products/${id}`, dto);
}

export interface ImportProductsRequest {
  rows: ImportRowPayload[];
  updateExisting: boolean;
  createCategories: boolean;
  storeId?: string;
}

export interface ImportProductsResult {
  created: number;
  updated: number;
  skipped: { line: number; sku: string; reason: string }[];
}

/** At most IMPORT_CHUNK_SIZE rows per call; each call is one transaction on the server. */
export function importProducts(body: ImportProductsRequest) {
  return apiClient.post<ImportProductsResult>("/products/import", body);
}

/** Matches the API's per-request limit. */
export const IMPORT_CHUNK_SIZE = 1000;
