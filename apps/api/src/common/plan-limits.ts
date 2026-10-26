import { Plan } from "@prisma/client";

/**
 * What each plan includes, in one place. `maxStores: null` means no limit.
 * Read, not enforced yet: creating a store over the limit is only logged.
 */
export interface PlanLimits {
  maxStores: number | null;
}

const LIMITS: Record<Plan, PlanLimits> = {
  [Plan.SIMPLE]: { maxStores: 1 },
  [Plan.PRO]: { maxStores: null },
};

export function planLimits(plan: Plan): PlanLimits {
  return LIMITS[plan];
}
