import type { CreateProformaDto, DocumentPrintResultDto, FiscalDocumentDto, FiscalDocumentListItemDto, PagedDto } from "@pos/shared";
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

/** Logs a print of a document before it goes to the printer; says whether it's a "2ª Via". */
export function recordPrint(id: string, kind: "RECEIPT" | "A4", copies = 1) {
  return apiClient.post<DocumentPrintResultDto>(`/fiscal-documents/${id}/prints`, { kind, copies });
}
