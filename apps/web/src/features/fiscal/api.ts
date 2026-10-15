import type { CreateProformaDto, FiscalDocumentDto, FiscalDocumentListItemDto, PagedDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function fetchFiscalDocument(id: string) {
  return apiClient.get<FiscalDocumentDto>(`/fiscal-documents/${id}`);
}

export interface FiscalDocumentFilter {
  type?: string;
  from?: string;
  to?: string;
  search?: string;
  storeId?: string;
  page: number;
  pageSize: number;
}

export function fetchFiscalDocuments(f: FiscalDocumentFilter) {
  const params = new URLSearchParams({ take: String(f.pageSize), skip: String((f.page - 1) * f.pageSize) });
  for (const key of ["type", "from", "to", "search", "storeId"] as const) {
    if (f[key]) params.set(key, f[key]!);
  }
  return apiClient.get<Pick<PagedDto<FiscalDocumentListItemDto>, "items" | "total">>(`/fiscal-documents?${params}`);
}

export function createProforma(dto: CreateProformaDto) {
  return apiClient.post<FiscalDocumentDto>("/fiscal-documents/proformas", dto);
}
