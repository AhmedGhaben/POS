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

export function fetchTerminals() {
  return apiClient.get<TerminalDto[]>("/terminals");
}

/** A 6-digit code for setting up a new till (owner or manager). */
export function createPairingCode(dto: CreateTerminalDto) {
  return apiClient.post<{ code: string; expiresAt: string; storeId: string; name: string }>("/terminals/pairing-codes", dto);
}

/** On the new till: the code becomes its registration (the Windows app keeps the key). */
export function pairTerminal(code: string) {
  return apiClient.post<TerminalDto>("/terminals/pair", { code }, { skipAuth: true });
}

/** A new key for this till; the Windows app keeps it (the page never sees it). */
export function rotateTerminalKey(id: string) {
  return apiClient.post<TerminalDto>(`/terminals/${id}/key`);
}
