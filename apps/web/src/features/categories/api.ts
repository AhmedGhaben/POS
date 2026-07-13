import type { CategoryDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchCategories() {
  return apiClient.get<CategoryDto[]>("/categories");
}

export function createCategory(name: string) {
  return apiClient.post<CategoryDto>("/categories", { name });
}
