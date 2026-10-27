import type { CreateExpenseDto, ExpenseDto, UpdateExpenseDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchExpenses(storeId: string, includeCancelled = false) {
  return apiClient.get<ExpenseDto[]>(`/expenses/store/${storeId}${includeCancelled ? "?includeCancelled=true" : ""}`);
}

/** Only while it isn't posted to accounting. */
export function updateExpense(id: string, dto: UpdateExpenseDto) {
  return apiClient.patch<ExpenseDto>(`/expenses/${id}`, dto);
}

/** Cancels it with a reason; if it was posted, the accounts reverse it. */
export function cancelExpense(id: string, reason: string) {
  return apiClient.post<ExpenseDto>(`/expenses/${id}/cancel`, { reason });
}

export function createExpense(dto: CreateExpenseDto) {
  return apiClient.post<ExpenseDto>("/expenses", dto);
}
