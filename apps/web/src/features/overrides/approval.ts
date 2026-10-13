import { create } from "zustand";
import type { ApproverDto, OfflineOverrideDto, OverrideGrantDto, Permission, RequestOverrideDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { desktop } from "@/features/desktop/bridge";
import { isWorkingOffline } from "@/features/pos/offline-store";
import { ApiError, apiClient } from "@/lib/api-client";

/**
 * Manager override (docs/plans/ANGOLA.md, phase 3). Someone without a
 * permission asks; a person who has it picks their name and types their
 * PIN. The cashier stays signed in. Online the server issues a single-use
 * token; offline the till checks the PIN itself and the upload carries who
 * approved it.
 */
export type Approval =
  | { kind: "token"; permission: Permission; token: string; approverId: string; approverName: string }
  | { kind: "offline"; permission: Permission; approverId: string; approverName: string };

export interface ApprovalRequest {
  permission: Permission;
  /** What it's for, e.g. "sale.discount" (audit trail). */
  action: string;
  /** Shown to the approver, e.g. "Cancel sale 0042 (12,00 Kz)". */
  description: string;
  details?: Record<string, unknown>;
}

interface ApprovalState {
  pending: (ApprovalRequest & { resolve: (approval: Approval | null) => void }) | null;
  ask: (request: ApprovalRequest) => Promise<Approval | null>;
  finish: (approval: Approval | null) => void;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pending: null,
  ask: (request) =>
    new Promise((resolve) => {
      get().pending?.resolve(null);
      set({ pending: { ...request, resolve } });
    }),
  finish: (approval) => {
    get().pending?.resolve(approval);
    set({ pending: null });
  },
}));

/** Opens the approval popup; null if it was cancelled. */
export function requestApproval(request: ApprovalRequest): Promise<Approval | null> {
  return useApprovalStore.getState().ask(request);
}

/** Who could approve this here: from the server, or from the till's saved list offline. */
export async function fetchApprovers(permission: Permission): Promise<ApproverDto[]> {
  const me = useAuthStore.getState().user?.id;
  if (isWorkingOffline() || useAuthStore.getState().offline) {
    return ((await desktop?.approval?.approvers(permission, me)) ?? []) as ApproverDto[];
  }
  const storeId = useAuthStore.getState().currentStoreId;
  const query = new URLSearchParams({ permission, ...(storeId ? { storeId } : {}) });
  return apiClient.get<ApproverDto[]>(`/overrides/approvers?${query}`);
}

export type ApproveError = "wrong" | "locked" | "no-access" | "unknown-user" | "failed";

/** Checks the approver's PIN: online on the server, offline on the till. */
export async function approve(
  request: ApprovalRequest,
  approver: ApproverDto,
  pin: string,
): Promise<{ ok: true; approval: Approval } | { ok: false; code: ApproveError; message?: string }> {
  const approverName = `${approver.firstName} ${approver.lastName}`;
  if (isWorkingOffline() || useAuthStore.getState().offline) {
    if (!desktop?.approval) return { ok: false, code: "failed" };
    const result = await desktop.approval.check(approver.id, pin, request.permission);
    if (!result.ok) return { ok: false, code: result.code };
    return { ok: true, approval: { kind: "offline", permission: request.permission, approverId: approver.id, approverName } };
  }
  try {
    const grant = await apiClient.post<OverrideGrantDto>("/overrides", {
      approverId: approver.id,
      pin,
      permission: request.permission,
      action: request.action,
      storeId: useAuthStore.getState().currentStoreId ?? undefined,
      details: request.details,
    } satisfies RequestOverrideDto);
    return { ok: true, approval: { kind: "token", permission: request.permission, token: grant.token, approverId: approver.id, approverName } };
  } catch (err) {
    // A wrong PIN is a 403 (never 401, which would touch the cashier's session).
    if (err instanceof ApiError && err.status === 403) {
      const code = (err.body as { code?: string } | undefined)?.code;
      return { ok: false, code: code === "PIN_LOCKED" ? "locked" : code === "WRONG_PIN" ? "wrong" : "no-access", message: err.message };
    }
    return { ok: false, code: "failed", message: err instanceof Error ? err.message : undefined };
  }
}

/** For a request: the header with an online approval. */
export function approvalHeaders(approval: Approval | null | undefined): Record<string, string> {
  return approval?.kind === "token" ? { "X-Override-Token": approval.token } : {};
}

/** For an offline upload: who approved it on the till. */
export function offlineOverride(approval: Approval | null | undefined): OfflineOverrideDto | undefined {
  return approval?.kind === "offline" ? { approverId: approval.approverId, permission: approval.permission } : undefined;
}
