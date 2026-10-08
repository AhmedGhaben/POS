import type { CreateEmployeeDto, EmployeeDto, StaffLoginDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchEmployees() {
  return apiClient.get<EmployeeDto[]>("/employees");
}

export function createEmployee(dto: CreateEmployeeDto) {
  return apiClient.post<EmployeeDto>("/employees", dto);
}

export function createEmployeeLogin(employeeId: string, dto: StaffLoginDto) {
  return apiClient.post<EmployeeDto>(`/employees/${employeeId}/login`, dto);
}
