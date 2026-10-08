import type { BusinessDto, StoreDto, UpdateBusinessDto, UpdateStoreDto } from "@pos/shared";
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

/** The API returns logoUrl relative to its root; the web app reaches the API under /api. */
export function logoSrc(business: Pick<BusinessDto, "logoUrl"> | null | undefined): string | null {
  return business?.logoUrl ? `/api${business.logoUrl}` : null;
}
