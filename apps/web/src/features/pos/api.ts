import type { CreateSaleDto, ProductDto, SaleDto } from "@pos/shared";
import { apiClient, ApiError } from "@/lib/api-client";

export async function findByBarcode(barcode: string): Promise<ProductDto | null> {
  try {
    return await apiClient.get<ProductDto>(`/products/barcode/${encodeURIComponent(barcode)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export function createSale(dto: CreateSaleDto) {
  return apiClient.post<SaleDto>("/sales", dto);
}
