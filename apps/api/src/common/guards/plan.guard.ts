import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Plan } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { REQUIRES_PLAN_KEY } from "../decorators/requires-plan.decorator";
import { AuthenticatedUser } from "../types/authenticated-user";

/**
 * Feature-gate guard for @RequiresPlan() routes. Unused in Phase 1 (no route
 * declares @RequiresPlan yet) — built now so Phase 4 (AI insights, Pro tier)
 * drops in without touching auth/guard wiring.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlan = this.reflector.getAllAndOverride<Plan>(REQUIRES_PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPlan) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      return false;
    }

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
    });
    if (!business) {
      return false;
    }

    if (requiredPlan === Plan.PRO && business.plan !== Plan.PRO) {
      throw new ForbiddenException("This feature requires the Pro plan");
    }
    return true;
  }
}
