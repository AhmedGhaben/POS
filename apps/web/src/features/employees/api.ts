import type { CreateEmployeeDto, EmployeeDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchEmployees() {
  return apiClient.get<EmployeeDto[]>("/employees");
}

export function createEmployee(dto: CreateEmployeeDto) {
  return apiClient.post<EmployeeDto>("/employees", dto);
}
