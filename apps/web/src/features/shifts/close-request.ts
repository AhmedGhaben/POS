import { create } from "zustand";
import { useAuthStore } from "@/features/auth/store";
import { logout } from "@/features/auth/api";
import { useShiftStore } from "./shift-store";
import { hasOpenCart } from "@/features/pos/cart-store";
import { useCartGuard } from "@/features/pos/cart-guard";
import { isWorkingOffline } from "@/features/pos/offline-store";
import { fetchShiftByClient } from "./api";
import type { LocalShift } from "./ledger";

/**
 * A cashier can't just log out with their shift open: Log out goes into
 * the close flow (blind count, report), which signs them out at the end
 * (docs/plans/ANGOLA.md, phase 3). The POS page opens the close dialog
 * when asked here.
 */
interface CloseRequestState {
  requested: boolean;
  request: () => void;
  done: () => void;
}

export const useCloseShiftRequest = create<CloseRequestState>((set) => ({
  requested: false,
  request: () => set({ requested: true }),
  done: () => set({ requested: false }),
}));

/** This person's open shift on this device, if any. */
export function myOpenShift() {
  const shift = useShiftStore.getState().current;
  const userId = useAuthStore.getState().user?.id;
  return shift && shift.openedBy.id === userId ? shift : null;
}

/** Ends the session and goes to the sign-in page. */
export async function signOut(navigate: (path: string) => void) {
  await logout().catch(() => {});
  useAuthStore.getState().clearSession();
  navigate("/login");
}

/**
 * The Log out button: with a sale in the cart, it asks what to do with it
 * first; with this person's own shift open on this device, it closes the
 * shift first (both on the POS page); otherwise (no shift, or someone
 * else's, such as a manager checking something at a cashier's till) it
 * signs out straight away and leaves any shift as it is.
 */
export async function logOutOrCloseShift(navigate: (path: string) => void) {
  // A sale still in the cart: the POS page asks what to do with it first.
  if (hasOpenCart()) {
    useCartGuard.getState().ask("logout");
    navigate("/pos");
    return;
  }
  const shift = myOpenShift();
  if (shift && (await stillOpen(shift))) {
    useCloseShiftRequest.getState().request();
    navigate("/pos");
    return;
  }
  await signOut(navigate);
}

/**
 * Whether the shift this device remembers is really still open: one closed
 * from another device (or by a manager) is dropped here, and Log out is a
 * plain sign-out. Offline, or not on the server yet: it's open.
 */
async function stillOpen(shift: LocalShift): Promise<boolean> {
  if (isWorkingOffline()) return true;
  try {
    const server = await fetchShiftByClient(shift.storeId, shift.clientId);
    if (server.status === "CLOSED") {
      useShiftStore.getState().markClosed(shift.clientId);
      return false;
    }
  } catch {
    // Not uploaded yet, or the server can't say: treat it as open.
  }
  return true;
}
