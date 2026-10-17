import type { CashMovementReason, PagedDto, ShiftDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { useDeviceStore } from "@/features/desktop/bridge";
import { deviceRole } from "@/features/desktop/device-role";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { syncOutbox } from "@/features/pos/sync";
import { apiClient } from "@/lib/api-client";
import { addToOutbox } from "@/lib/offline-db";
import { localSummary, type LocalShift } from "./ledger";
import { offlineOverride, type Approval } from "@/features/overrides/approval";
import { useShiftStore } from "./shift-store";

/**
 * Shift events go through the outbox, like drawer openings: recorded on the
 * till first (so they work offline), then uploaded in order with the sales.
 */
async function queue(entry: Parameters<typeof addToOutbox>[0]) {
  await addToOutbox(entry);
  await useOfflineStore.getState().refreshPendingCount();
  if (!isWorkingOffline()) void syncOutbox().catch(() => undefined);
}

function me() {
  const user = useAuthStore.getState().user!;
  return { id: user.id, name: `${user.firstName} ${user.lastName}` };
}

export async function openShift(storeId: string, openingFloat: number): Promise<LocalShift> {
  // Only a till opens shifts; a back-office device never does.
  if (deviceRole() !== "TILL") throw new Error("This device is set up for back office: it doesn't open shifts");
  const clientId = crypto.randomUUID();
  const openedAt = new Date().toISOString();
  const terminalId = useDeviceStore.getState().terminal?.id ?? null;
  const shift: LocalShift = { clientId, storeId, terminalId, openedAt, openingFloat, openedBy: me(), sales: [], movements: [] };
  useShiftStore.getState().setCurrent(shift);
  await queue({
    clientId,
    kind: "shift-open",
    createdAt: openedAt,
    payload: {
      storeId,
      clientId,
      terminalId: terminalId ?? undefined,
      openingFloat,
      openedAt,
      offline: isWorkingOffline(),
      actingUserId: me().id,
    },
  });
  return shift;
}

/** Cash in or out. A cash out by someone without CASH_OUT carries a manager's approval. */
export async function addCashMovement(
  shift: LocalShift,
  { approval, ...movement }: { type: "IN" | "OUT"; amount: number; reason: CashMovementReason; note?: string; approval?: Approval | null },
) {
  const clientId = crypto.randomUUID();
  const occurredAt = new Date().toISOString();
  const note = movement.note?.trim() || null;
  useShiftStore.getState().recordMovement({ clientId, ...movement, note, occurredAt, user: me().name });
  await queue({
    clientId,
    kind: "cash-movement",
    createdAt: occurredAt,
    payload: {
      storeId: shift.storeId,
      shiftClientId: shift.clientId,
      clientId,
      ...movement,
      note: note ?? undefined,
      occurredAt,
      offline: isWorkingOffline(),
      actingUserId: me().id,
      offlineOverride: offlineOverride(approval),
      overrideToken: approval?.kind === "token" ? approval.token : undefined,
    },
  });
}

/**
 * Closes the shift with the count. Returns the till's own figure for the
 * expected cash; the server's report follows once it has the close.
 */
export async function closeShift(
  shift: LocalShift,
  countedCash: number,
  note?: string,
  countedDenominations?: Record<string, number> | null,
) {
  const summary = localSummary(shift);
  const closedAt = new Date().toISOString();
  const clientId = crypto.randomUUID();
  useShiftStore.getState().markClosed(shift.clientId);
  await queue({
    clientId,
    kind: "shift-close",
    createdAt: closedAt,
    payload: {
      storeId: shift.storeId,
      shiftClientId: shift.clientId,
      countedCash,
      countedDenominations: countedDenominations ?? undefined,
      // An adopted shift's record here is incomplete: leave it to the server.
      tillExpectedCash: shift.adopted ? undefined : Number(summary.expectedCash),
      note: note?.trim() || undefined,
      closedAt,
      offline: isWorkingOffline(),
      actingUserId: me().id,
    },
  });
  return { summary, closedAt };
}

export function fetchShiftByClient(storeId: string, clientId: string) {
  return apiClient.get<ShiftDto>(`/shifts/client/${clientId}?storeId=${storeId}`, { timeoutMs: 8000 });
}

export async function fetchCurrentShift(storeId: string, terminalId?: string | null) {
  const query = new URLSearchParams({ storeId, ...(terminalId ? { terminalId } : {}) });
  const res = await apiClient.get<{ shift: ShiftDto | null }>(`/shifts/current?${query}`, { timeoutMs: 8000 });
  return res.shift;
}

export interface ShiftFilters {
  status?: "OPEN" | "CLOSED";
  flagged?: boolean;
  cashierId?: string;
  terminalId?: string;
}

export function fetchShifts(storeId: string, page: number, pageSize: number, filters: ShiftFilters = {}) {
  const query = new URLSearchParams({ storeId, page: String(page), pageSize: String(pageSize) });
  if (filters.status) query.set("status", filters.status);
  if (filters.flagged) query.set("flagged", "true");
  if (filters.cashierId) query.set("cashierId", filters.cashierId);
  if (filters.terminalId) query.set("terminalId", filters.terminalId);
  return apiClient.get<PagedDto<ShiftDto>>(`/shifts?${query}`);
}

/** People who can open shifts, for the Shifts page filter (owners and managers). */
export function fetchShiftPeople() {
  return apiClient.get<{ id: string; firstName: string; lastName: string }[]>("/users");
}

export function fetchShift(id: string) {
  return apiClient.get<ShiftDto>(`/shifts/${id}`);
}

/** A shift opened on another device (or before this till kept records): use it here. */
export function adoptShift(server: ShiftDto) {
  if (useShiftStore.getState().closedIds.includes(server.clientId)) return;
  useShiftStore.getState().setCurrent({
    clientId: server.clientId,
    storeId: server.storeId,
    terminalId: server.terminalId,
    openedAt: server.openedAt,
    openingFloat: Number(server.openingFloat),
    openedBy: { id: server.openedBy.id, name: `${server.openedBy.firstName} ${server.openedBy.lastName}` },
    sales: [],
    movements: [],
    adopted: true,
  });
}
