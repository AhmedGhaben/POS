import type { Permission } from "@pos/shared";
import { useAuthStore } from "./store";

/** Does the signed-in person have this permission? Uses the cached map, so it works offline. */
export function useHasPermission(permission: Permission) {
  return useAuthStore((s) => s.permissions?.[permission] === true);
}
