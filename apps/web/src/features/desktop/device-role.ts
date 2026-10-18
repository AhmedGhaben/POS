import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isDesktop } from "./bridge";

/**
 * What this device is for (docs/DECISIONS.md, "Shifts follow selling"):
 * a till sells and has a cash drawer, so it opens shifts; a back-office
 * device (a browser at home, an office PC) never does. Set in This device.
 * The Windows app is a till until changed; a browser asks an owner or
 * manager the first time someone opens the POS screen on it.
 */
export type DeviceRole = "TILL" | "BACK_OFFICE";

/** Before anyone chooses: the Windows app is a till; a browser hasn't been told (null: ask). */
export const defaultDeviceRole = (desktop = isDesktop): DeviceRole | null => (desktop ? "TILL" : null);

interface DeviceRoleState {
  /** Null until someone chooses: the platform's default applies. */
  role: DeviceRole | null;
  setRole: (role: DeviceRole) => void;
}

export const useDeviceRoleStore = create<DeviceRoleState>()(
  persist(
    (set) => ({
      role: null,
      setRole: (role) => set({ role }),
    }),
    { name: "pos-device-role" },
  ),
);

/** This device's role, or null for a browser nobody has set up yet. */
export function deviceRole(): DeviceRole | null {
  return useDeviceRoleStore.getState().role ?? defaultDeviceRole();
}

export function useDeviceRole(): DeviceRole | null {
  return useDeviceRoleStore((s) => s.role) ?? defaultDeviceRole();
}

/** This device sells: shifts open here (with a float) when someone goes to sell. */
export const useIsTill = () => useDeviceRole() === "TILL";
