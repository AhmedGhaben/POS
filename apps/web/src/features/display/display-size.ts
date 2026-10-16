import * as React from "react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth/store";

/**
 * Each person's display size (docs/plans/ANGOLA.md, phase 11): a percent of
 * the normal text size, applied to the root font size, so everything sized
 * in rem (text, spacing, buttons) grows with it. Printed documents are in
 * mm/pt, and the print rules reset the root size (styles/globals.css).
 */
export const DISPLAY_SIZES = [
  { value: 90, label: "small" },
  { value: 100, label: "normal" },
  { value: 115, label: "large" },
  { value: 130, label: "extraLarge" },
] as const;
export type DisplaySize = (typeof DISPLAY_SIZES)[number]["value"];

export function isDisplaySize(v: unknown): v is DisplaySize {
  return DISPLAY_SIZES.some((s) => s.value === v);
}

/** The root font size for a size; "" leaves the browser's own (normal). */
export function rootFontSize(size: number | null | undefined): string {
  return isDisplaySize(size) && size !== 100 ? `${size}%` : "";
}

export function applyDisplaySize(size: number | null | undefined) {
  document.documentElement.style.fontSize = rootFontSize(size);
}

/** Follows the signed-in person's size; signed out (the sign-in screens), normal. Mounted once, in App. */
export function useDisplaySizeSync() {
  const size = useAuthStore((s) => s.user?.displaySize ?? null);
  React.useEffect(() => applyDisplaySize(size), [size]);
}

/** The size on screen and a setter that saves it for this person (on the server, so it follows them to other tills). */
export function useDisplaySize(): [DisplaySize, (size: DisplaySize) => void] {
  const saved = useAuthStore((s) => s.user?.displaySize ?? null);
  const setUserDisplaySize = useAuthStore((s) => s.setUserDisplaySize);
  const offline = useAuthStore((s) => s.offline);
  const change = React.useCallback(
    (size: DisplaySize) => {
      setUserDisplaySize(size === 100 ? null : size);
      // Offline (a till signed in by PIN) it applies now; the next online sign-in brings the saved one back.
      if (!offline) void apiClient.patch("/users/me/display-size", { displaySize: size }).catch(() => {});
    },
    [setUserDisplaySize, offline],
  );
  return [isDisplaySize(saved) ? saved : 100, change];
}
