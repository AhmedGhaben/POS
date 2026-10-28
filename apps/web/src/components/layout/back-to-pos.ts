import type { Role } from "@pos/shared";

/** Shown with a sale in the cart or after leaving the POS; never to an accountant, who has no till. */
export function showBackToPos({ role, left, items }: { role: Role | undefined; left: boolean; items: number }) {
  return role !== "ACCOUNTANT" && (left || items > 0);
}
