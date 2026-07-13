import { Permission, Role } from "@prisma/client";

/**
 * What each role can do absent any UserPermission override. Kept as a plain
 * code constant (not DB-stored) so the baseline policy is reviewable in a
 * diff rather than hidden in seed data.
 */
export const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: [Permission.VIEW_COST_PRICE, Permission.PROCESS_RETURN],
  [Role.MANAGER]: [Permission.VIEW_COST_PRICE, Permission.PROCESS_RETURN],
  [Role.CASHIER]: [],
};
