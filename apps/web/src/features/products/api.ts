import type { CreateProductDto, ProductDto, UpdateProductDto } from "@pos/shared";
import type { ImportRowPayload } from "./import-rows";
import { ApiError, apiClient } from "@/lib/api-client";

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

/** Only a product with no sales, purchases, stock or document history (409 otherwise: archive it). */
export function deleteProduct(id: string) {
  return apiClient.delete<void>(`/products/${id}`);
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

/** A photo as a data URL (resized in the browser first: features/business/resize-logo.ts). */
export function uploadProductPhoto(id: string, dataUrl: string) {
  return apiClient.put<{ id: string; photoId: string | null }>(`/products/${id}/photo`, { dataUrl });
}

export function removeProductPhoto(id: string) {
  return apiClient.delete<{ id: string; photoId: string | null }>(`/products/${id}/photo`);
}

/** Where an <img> loads a product's photo; null without one. */
export function productPhotoSrc(product: { photoId?: string | null }): string | null {
  return product.photoId ? `/api/product-photos/${product.photoId}` : null;
}

/** The active product with this barcode, or null (for the duplicate check while typing). */
export async function findProductByBarcode(barcode: string): Promise<ProductDto | null> {
  try {
    return await apiClient.get<ProductDto>(`/products/barcode/${encodeURIComponent(barcode)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
