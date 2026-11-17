import { create } from "zustand";
import { isDesktop, useDeviceStore } from "@/features/desktop/bridge";

/**
 * The till's lock screen: covers the app (the cart stays) until someone types their PIN.
 *
 * Fail-closed: in the Windows app it starts locked, so a restart, a reload
 * or a remount never comes up unlocked with the session saved from last
 * time. Once the app knows whether it's a registered till (settleStartupLock),
 * an unregistered one (first-time setup) is unlocked; a registered till stays
 * locked until someone signs in with their PIN or their email and password.
 * In a browser it starts unlocked, as before.
 */
interface LockState {
  locked: boolean;
  /** The lock screen's "Sign in with email instead": the sign-in page opens on the email form. */
  emailSignIn: boolean;
  lock: () => void;
  unlock: () => void;
  setEmailSignIn: (on: boolean) => void;
}

export const useLockStore = create<LockState>((set) => ({
  locked: isDesktop,
  emailSignIn: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
  setEmailSignIn: (on) => set({ emailSignIn: on }),
}));

let settled = false;

/**
 * Called when the device store has loaded: the Windows app knows which till
 * it is. Only the first time counts (a till registered later in the session
 * doesn't suddenly lock; one unregistered later doesn't unlock).
 */
export function settleStartupLock(state: { loaded: boolean; terminal: unknown } = useDeviceStore.getState()) {
  if (settled || !state.loaded) return;
  settled = true;
  if (!state.terminal) useLockStore.getState().unlock();
}

settleStartupLock();
useDeviceStore.subscribe((state) => settleStartupLock(state));

/** PIN sign-in is on: the Windows app, a registered till with its key, and people with PINs. */
export function useTillMode() {
  return useDeviceStore((s) => !!s.terminal && s.hasKey && s.staff.length > 0);
}
