import { create } from "zustand";
import { useAuthStore } from "@/features/auth/store";
import { logout } from "@/features/auth/api";
import { useShiftStore } from "./shift-store";

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
 * The Log out button: with this person's shift open, it closes the shift
 * first (on the POS page); otherwise it signs out straight away.
 */
export async function logOutOrCloseShift(navigate: (path: string) => void) {
  if (myOpenShift()) {
    useCloseShiftRequest.getState().request();
    navigate("/pos");
    return;
  }
  await signOut(navigate);
}
