import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isDesktop } from "./bridge";

/**
 * What this device is for (docs/DECISIONS.md, "Shifts follow selling"):
 * a till sells and has a cash drawer, so it opens shifts; a back-office
 * device (a browser at home, an office PC) never does. Set in This device;
 * until then the Windows app is a till and a browser is back office.
 */
export type DeviceRole = "TILL" | "BACK_OFFICE";

export const defaultDeviceRole = (desktop = isDesktop): DeviceRole => (desktop ? "TILL" : "BACK_OFFICE");

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

export function deviceRole(): DeviceRole {
  return useDeviceRoleStore.getState().role ?? defaultDeviceRole();
}

export function useDeviceRole(): DeviceRole {
  return useDeviceRoleStore((s) => s.role) ?? defaultDeviceRole();
}

/** This device sells: shifts open here (with a float) when someone goes to sell. */
export const useIsTill = () => useDeviceRole() === "TILL";
