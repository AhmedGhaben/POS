import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission } from "@prisma/client";
import { PermissionsService } from "../permissions/permissions.service";
import { PERMISSION_KEY } from "../decorators/requires-permission.decorator";
import { AuthenticatedUser } from "../types/authenticated-user";
import { OVERRIDE_HEADER, OverridesService, type UsedOverride } from "../../overrides/overrides.service";

/**
 * Applied globally in AppModule; only routes with @RequiresPermission() are
 * checked. Someone without the permission can still go ahead once with a
 * manager's approval (X-Override-Token, see OverridesService); the approval
 * used is left on the request as `override`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly overrides: OverridesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) return false;

    if (await this.permissionsService.hasPermission(user.userId, user.role, required)) return true;

    // A till uploading what was done offline, approved on the till by a
    // manager's PIN: it already happened, so it's recorded, not refused.
    const offline = request.body?.offlineOverride;
    if (request.terminal && offline?.permission === required && typeof offline.approverId === "string") {
      request.override = await this.overrides.recordOffline(user, {
        approverId: offline.approverId,
        permission: required,
        action: `${request.method} ${request.route?.path ?? request.url}`,
        storeId: typeof request.body?.storeId === "string" ? request.body.storeId : undefined,
      });
      return true;
    }

    const token = request.headers?.[OVERRIDE_HEADER];
    if (typeof token !== "string" || !token) return false;
    const used: UsedOverride = await this.overrides.consume(token, user, required);
    request.override = used;
    return true;
  }
}
