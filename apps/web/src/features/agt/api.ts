import { apiClient } from "@/lib/api-client";

/** AGT e-invoicing (docs/plans/ANGOLA.md, phase 9). */

export type AgtStatus = "QUEUED" | "SENT" | "VALID" | "REJECTED";

export interface AgtStatusDto {
  /** The server's feature flag (AGT_EINVOICE_ENABLED, with keys and credentials). */
  enabled: boolean;
  environment: "homologation" | "production";
  /** The business's "e-invoicing active" setting. */
  businessActive: boolean;
  counts: Record<AgtStatus, number>;
}

export interface AgtSubmissionDto {
  id: string;
  status: AgtStatus;
  requestId: string | null;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  errors: { code: string; description: string }[] | null;
  correctionOfDocumentNo: string | null;
  correctedByDocumentId: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  document: { id: string; documentNo: string; documentType: string; invoiceDate: string; buyerName: string; grossTotal: string; storeId: string };
}

export const AGT_STATUS_KEY = ["agt", "status"] as const;

export function fetchAgtStatus() {
  return apiClient.get<AgtStatusDto>("/agt/status");
}

export function fetchAgtSubmissions(status: AgtStatus | null, take: number, skip: number) {
  const params = new URLSearchParams({ take: String(take), skip: String(skip), ...(status ? { status } : {}) });
  return apiClient.get<{ items: AgtSubmissionDto[]; total: number }>(`/agt/submissions?${params}`);
}

export function retrySubmission(id: string) {
  return apiClient.post<AgtSubmissionDto>(`/agt/submissions/${id}/retry`);
}

export function correctSubmission(id: string, documentId: string) {
  return apiClient.post<AgtSubmissionDto>(`/agt/submissions/${id}/correct`, { documentId });
}
