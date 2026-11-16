import { useAuthStore } from "@/features/auth/store";
import { BackOfficeShell } from "./BackOfficeShell";
import { PosShell } from "./PosShell";

/**
 * This device: a cashier has no back office, so it opens in the till's
 * frame (with Back to POS). Owners and managers see it like any other
 * sidebar page, with "Open point of sale" at the bottom of the sidebar.
 */
export function DeviceShell() {
  const role = useAuthStore((s) => s.user?.role);
  // PosShell sends an accountant on to the books.
  return role === "CASHIER" || role === "ACCOUNTANT" ? <PosShell /> : <BackOfficeShell />;
}
