import * as React from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Touch mode, per device (This device): most tills here are small
 * touchscreens with no keyboard, and Windows shows no keypad for a web
 * page. When it's on, number fields open an on-screen keypad and tap
 * targets get bigger (html.touch, styles/globals.css). A physical keyboard
 * keeps working either way.
 */
interface TouchModeState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useTouchModeStore = create<TouchModeState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: "pos-touch-mode" },
  ),
);

export function useTouchMode(): boolean {
  return useTouchModeStore((s) => s.enabled);
}

/** Puts html.touch on while touch mode is on. Mounted once, in App. */
export function useTouchModeSync() {
  const enabled = useTouchMode();
  React.useEffect(() => {
    document.documentElement.classList.toggle("touch", enabled);
  }, [enabled]);
}
