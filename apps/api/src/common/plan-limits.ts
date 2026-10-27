import { Plan } from "@prisma/client";

/**
 * What each plan includes, in one place: Simple 1 store, Pro 3 (Rede, 10
 * stores, comes with the launch work). `maxStores: null` would mean no
 * limit. Read, not enforced yet: creating a store over the limit is only logged.
 */
export interface PlanLimits {
  maxStores: number | null;
}

const LIMITS: Record<Plan, PlanLimits> = {
  [Plan.SIMPLE]: { maxStores: 1 },
  [Plan.PRO]: { maxStores: 3 },
};

export function planLimits(plan: Plan): PlanLimits {
  return LIMITS[plan];
}
