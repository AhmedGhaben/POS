import type { BankAccountDto, BusinessDto, SaveBankAccountDto, StoreDto, TaxRateDto, UpdateBusinessDto, UpdateStoreDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export const BUSINESS_QUERY_KEY = ["business", "me"] as const;

export function fetchBusiness() {
  return apiClient.get<BusinessDto>("/businesses/me");
}

export function updateBusiness(dto: UpdateBusinessDto) {
  return apiClient.patch<BusinessDto>("/businesses/me", dto);
}

export function uploadLogo(dataUrl: string) {
  return apiClient.put<BusinessDto>("/businesses/me/logo", { dataUrl });
}

export function removeLogo() {
  return apiClient.delete<BusinessDto>("/businesses/me/logo");
}

export function updateStore(storeId: string, dto: UpdateStoreDto) {
  return apiClient.patch<StoreDto>(`/stores/${storeId}`, dto);
}

export const BANK_ACCOUNTS_QUERY_KEY = ["bank-accounts"] as const;

export function fetchBankAccounts() {
  return apiClient.get<BankAccountDto[]>("/bank-accounts");
}

export function createBankAccount(dto: SaveBankAccountDto) {
  return apiClient.post<BankAccountDto>("/bank-accounts", dto);
}

export function updateBankAccount(id: string, dto: Partial<SaveBankAccountDto>) {
  return apiClient.patch<BankAccountDto>(`/bank-accounts/${id}`, dto);
}

export function deleteBankAccount(id: string) {
  return apiClient.delete<{ deleted: true }>(`/bank-accounts/${id}`);
}

export const TAX_RATES_QUERY_KEY = ["tax-rates"] as const;

export function fetchTaxRates() {
  return apiClient.get<TaxRateDto[]>("/tax-rates");
}

export function createTaxRate(dto: { name: string; taxCode: string; percentage: number; region: string; note?: string }) {
  return apiClient.post<TaxRateDto>("/tax-rates", dto);
}

export function updateTaxRate(
  id: string,
  dto: { name?: string; percentage?: number; active?: boolean; isDefault?: true; verifyValidity?: boolean; note?: string },
) {
  return apiClient.patch<TaxRateDto>(`/tax-rates/${id}`, dto);
}

/** "AO03000600000012345678901" → "AO03 0006 0000 0012 3456 7890 1". */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

/** The API returns logoUrl relative to its root; the web app reaches the API under /api. */
export function logoSrc(business: Pick<BusinessDto, "logoUrl"> | null | undefined): string | null {
  return business?.logoUrl ? `/api${business.logoUrl}` : null;
}
