import { useTranslation } from "react-i18next";
import type { LogoStatus } from "@/components/brand/StorbitLogo";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { useStoresStatus } from "./api";
import { offlineStores } from "./status-view";

/**
 * The back-office logo's diamond: amber if this device is offline (it can't
 * check the stores then) or any store's till is offline; green otherwise.
 * Never red. The note says which: this device, or how many stores.
 */
export function useOverallStatus(): { status: LogoStatus; note: string | null } {
  const { t } = useTranslation("reports");
  const thisDeviceOffline = useOfflineStore((s) => isWorkingOffline(s));
  const stores = useStoresStatus().data;
  if (thisDeviceOffline) return { status: "offline", note: t("storesNow.logo.thisDevice") };
  const offline = offlineStores(stores).length;
  if (offline > 0) return { status: "offline", note: t("storesNow.logo.stores", { offline, total: stores?.length ?? offline }) };
  return { status: "online", note: null };
}
