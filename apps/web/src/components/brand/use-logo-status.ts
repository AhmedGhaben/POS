import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import type { LogoStatus } from "./StorbitLogo";

/**
 * The logo's diamond follows this device's existing connection state
 * (the same one the till's offline indicator reads): amber when offline.
 * Reads only; it starts nothing.
 */
export function useConnectionLogoStatus(): LogoStatus {
  const offline = useOfflineStore((s) => isWorkingOffline(s));
  return offline ? "offline" : "online";
}
