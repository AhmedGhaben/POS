import type { CategoryDeleteResultDto, CategoryDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchCategories() {
  return apiClient.get<CategoryDto[]>("/categories");
}

/** `skuPrefix` ("ELE"): new products in the category get "ELE-028" suggested; blank for none. */
export function createCategory(name: string, skuPrefix = "") {
  return apiClient.post<CategoryDto>("/categories", { name, skuPrefix });
}

export function renameCategory(id: string, name: string, skuPrefix = "") {
  return apiClient.patch<CategoryDto>(`/categories/${id}`, { name, skuPrefix });
}

/** The SKU suggested for a new product in the category, not taken until it's saved. */
export function fetchNextSku(id: string) {
  return apiClient.get<{ sku: string | null }>(`/categories/${id}/next-sku`);
}

/** Deletes a category; its products move to `reassignTo`, or are left uncategorized. */
export function deleteCategory(id: string, reassignTo: string | null) {
  const query = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
  return apiClient.delete<CategoryDeleteResultDto>(`/categories/${id}${query}`);
}
