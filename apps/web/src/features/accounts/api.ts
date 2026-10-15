import type {
  CreateCustomerDto,
  CreateCustomerPaymentDto,
  CreateSupplierPaymentDto,
  CustomerAccountDto,
  CustomerDto,
  CustomerPaymentDto,
  SupplierAccountDto,
  SupplierDto,
  SupplierPaymentDto,
  UpdateCustomerDto,
  UpdateSupplierDto,
} from "@pos/shared";
import { apiClient } from "@/lib/api-client";

/** Customer and supplier accounts (docs/plans/ANGOLA.md, phase 4). */

export const CUSTOMERS_KEY = ["customers", "with-balance"] as const;
export const SUPPLIERS_KEY = ["suppliers", "with-balance"] as const;

export function fetchCustomersWithBalance(search?: string) {
  const params = new URLSearchParams({ withBalance: "true", ...(search ? { search } : {}) });
  return apiClient.get<CustomerDto[]>(`/customers?${params}`);
}

export function createCustomer(dto: CreateCustomerDto) {
  return apiClient.post<CustomerDto>("/customers", dto);
}

export function updateCustomer(id: string, dto: UpdateCustomerDto) {
  return apiClient.patch<CustomerDto>(`/customers/${id}`, dto);
}

export function fetchCustomerAccount(id: string) {
  return apiClient.get<CustomerAccountDto>(`/customers/${id}/account`);
}

export function receivePayment(dto: CreateCustomerPaymentDto) {
  return apiClient.post<CustomerPaymentDto>("/customer-payments", dto);
}

export function annulPayment(id: string, reason: string) {
  return apiClient.post<CustomerPaymentDto>(`/customer-payments/${id}/annul`, { reason });
}

export function fetchSuppliersWithBalance() {
  return apiClient.get<SupplierDto[]>("/suppliers?withBalance=true");
}

export function updateSupplier(id: string, dto: UpdateSupplierDto) {
  return apiClient.patch<SupplierDto>(`/suppliers/${id}`, dto);
}

export function fetchSupplierAccount(id: string) {
  return apiClient.get<SupplierAccountDto>(`/suppliers/${id}/account`);
}

export function paySupplier(dto: CreateSupplierPaymentDto) {
  return apiClient.post<SupplierPaymentDto>("/supplier-payments", dto);
}

export function cancelSupplierPayment(id: string, reason: string) {
  return apiClient.post<SupplierPaymentDto>(`/supplier-payments/${id}/cancel`, { reason });
}
