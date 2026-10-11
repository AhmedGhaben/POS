import { create } from "zustand";
import { useDeviceStore } from "@/features/desktop/bridge";

/** The till's lock screen: covers the app (the cart stays) until someone types their PIN. */
interface LockState {
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useLockStore = create<LockState>((set) => ({
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));

/** PIN sign-in is on: the Windows app, a registered till with its key, and people with PINs. */
export function useTillMode() {
  return useDeviceStore((s) => !!s.terminal && s.hasKey && s.staff.length > 0);
}
