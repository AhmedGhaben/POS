import type { CreateExpenseDto, ExpenseDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchExpenses(storeId: string) {
  return apiClient.get<ExpenseDto[]>(`/expenses/store/${storeId}`);
}

export function createExpense(dto: CreateExpenseDto) {
  return apiClient.post<ExpenseDto>("/expenses", dto);
}
