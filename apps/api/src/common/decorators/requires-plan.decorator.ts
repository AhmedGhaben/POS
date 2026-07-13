import { SetMetadata } from "@nestjs/common";
import { Plan } from "@prisma/client";

export const REQUIRES_PLAN_KEY = "requiresPlan";

/**
 * Feature-gate decorator for Pro-tier-only routes (e.g. AI insights, Phase 4).
 * Not applied to any route in Phase 1 — exists so the gating pattern doesn't
 * require redesigning auth/guards later.
 */
export const RequiresPlan = (plan: Plan) => SetMetadata(REQUIRES_PLAN_KEY, plan);
