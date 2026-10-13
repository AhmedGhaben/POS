import type { CategoryDeleteResultDto, CategoryDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchCategories() {
  return apiClient.get<CategoryDto[]>("/categories");
}

export function createCategory(name: string) {
  return apiClient.post<CategoryDto>("/categories", { name });
}

export function renameCategory(id: string, name: string) {
  return apiClient.patch<CategoryDto>(`/categories/${id}`, { name });
}

/** Deletes a category; its products move to `reassignTo`, or are left uncategorized. */
export function deleteCategory(id: string, reassignTo: string | null) {
  const query = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
  return apiClient.delete<CategoryDeleteResultDto>(`/categories/${id}${query}`);
}
