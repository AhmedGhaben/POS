import type {
  LowStockReportItemDto,
  ReportSummaryDto,
  SalesTrendPointDto,
  StoreComparisonDto,
  TopProductReportDto,
} from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchSummary(storeId: string, days: number) {
  return apiClient.get<ReportSummaryDto>(`/reports/store/${storeId}/summary?days=${days}`);
}

export function fetchSalesTrend(storeId: string, days: number) {
  return apiClient.get<SalesTrendPointDto[]>(`/reports/store/${storeId}/sales-trend?days=${days}`);
}

export function fetchTopProducts(storeId: string, days: number, limit = 5) {
  return apiClient.get<TopProductReportDto[]>(
    `/reports/store/${storeId}/top-products?days=${days}&limit=${limit}`,
  );
}

export function fetchLowStock(storeId: string) {
  return apiClient.get<LowStockReportItemDto[]>(`/reports/store/${storeId}/low-stock`);
}

export function fetchStoreComparison(days: number) {
  return apiClient.get<StoreComparisonDto[]>(`/reports/business/store-comparison?days=${days}`);
}
