import { Permission, Role } from "@prisma/client";

/** Everything a manager may do by default (the owner too). */
const MANAGER_DEFAULTS: Permission[] = [
  Permission.VIEW_COST_PRICE,
  Permission.PROCESS_RETURN,
  Permission.OPEN_DRAWER,
  Permission.VOID_SALE,
  Permission.APPLY_DISCOUNT,
  Permission.DISCOUNT_ABOVE_LIMIT,
  Permission.CHANGE_PRICE,
  Permission.SELL_ON_CREDIT,
  Permission.CASH_OUT,
];

/**
 * What each role can do absent any UserPermission override. Kept as a plain
 * code constant (not DB-stored) so the baseline policy is reviewable in a
 * diff rather than hidden in seed data. A cashier without a permission can
 * still get one action approved by a manager (ManagerOverride).
 */
export const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: MANAGER_DEFAULTS,
  [Role.MANAGER]: MANAGER_DEFAULTS,
  [Role.CASHIER]: [],
  // Reads stock values (cost prices); never works a till.
  [Role.ACCOUNTANT]: [Permission.VIEW_COST_PRICE],
};
