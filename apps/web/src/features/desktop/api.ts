import type { CreateTerminalDto, TerminalDto, UpdateTerminalDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

export function createTerminal(dto: CreateTerminalDto) {
  return apiClient.post<TerminalDto>("/terminals", dto);
}

export function fetchTerminal(id: string) {
  return apiClient.get<TerminalDto>(`/terminals/${id}`);
}

export function updateTerminal(id: string, dto: UpdateTerminalDto) {
  return apiClient.patch<TerminalDto>(`/terminals/${id}`, dto);
}

/** A new key for this till; the Windows app keeps it (the page never sees it). */
export function rotateTerminalKey(id: string) {
  return apiClient.post<TerminalDto>(`/terminals/${id}/key`);
}
