import { toast } from "sonner";
import { DrawerOpenReason, Permission, type DrawerSubReason } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { syncOutbox } from "@/features/pos/sync";
import { addToOutbox } from "@/lib/offline-db";
import { desktop, desktopLog, useDeviceStore } from "./bridge";

export const DRAWER_SUB_REASON_LABELS: Record<DrawerSubReason, string> = {
  CASH_PICKUP: "Cash pickup",
  FLOAT_ADJUSTMENT: "Float adjustment",
  MANAGER_INSPECTION: "Manager inspection",
  TEST: "Test",
  OTHER: "Other",
};

/** A drawer is set up on this till (Windows app only). */
export function useHasDrawer() {
  return useDeviceStore((s) => !!s.drawer && s.drawer.connection !== "none");
}

/** May this user open the drawer without a sale? Uses the cached permissions, so it works offline. */
export function useCanOpenDrawer() {
  return useAuthStore((s) => s.permissions?.[Permission.OPEN_DRAWER] === true);
}

interface OpenDrawerOptions {
  reason: DrawerOpenReason;
  subReason?: DrawerSubReason;
  note?: string;
  /** The cash sale's clientId, for SALE_CASH_PAYMENT. */
  saleClientId?: string;
}

/**
 * Opens the cash drawer and records the opening in the outbox, online or
 * offline (it syncs with the sales). The record is written even if the
 * drawer didn't open, with the error, so a failed kick shows up too.
 * Never throws; returns whether the drawer opened.
 */
export async function openCashDrawer(options: OpenDrawerOptions): Promise<boolean> {
  if (!desktop) return false;
  const result = await desktop.drawer.open().catch((err: Error) => ({ ok: false as const, error: err.message }));

  const { currentStoreId } = useAuthStore.getState();
  if (currentStoreId) {
    const clientId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    try {
      await addToOutbox({
        clientId,
        kind: "drawer-event",
        createdAt: occurredAt,
        payload: {
          storeId: currentStoreId,
          clientId,
          terminalId: useDeviceStore.getState().terminal?.id,
          reason: options.reason,
          subReason: options.reason === DrawerOpenReason.MANUAL_OPEN ? (options.subReason ?? "OTHER") : undefined,
          note: options.note?.trim() || undefined,
          saleClientId: options.saleClientId,
          succeeded: result.ok,
          error: result.ok ? undefined : result.error.slice(0, 300),
          offline: isWorkingOffline(),
          occurredAt,
        },
      });
      await useOfflineStore.getState().refreshPendingCount();
      if (!isWorkingOffline()) void syncOutbox().catch(() => undefined);
    } catch (err) {
      desktopLog("error", `[drawer] couldn't record the opening: ${(err as Error).message}`);
    }
  }

  if (!result.ok) {
    toast.error(`The cash drawer didn't open: ${result.error}`, { duration: 10_000 });
  }
  return result.ok;
}
