import type { InvoiceDto, InvoiceListItemDto, IssueInvoiceDto, PagedDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

/** Returns the existing invoice if the sale was already invoiced. */
export function issueInvoice(saleId: string, dto: IssueInvoiceDto) {
  return apiClient.post<InvoiceDto>(`/sales/${saleId}/invoice`, dto);
}

export function fetchInvoices(page: number, pageSize = 25) {
  return apiClient.get<PagedDto<InvoiceListItemDto>>(`/invoices?page=${page}&pageSize=${pageSize}`);
}

export function fetchInvoice(invoiceId: string) {
  return apiClient.get<InvoiceDto>(`/invoices/${invoiceId}`);
}
