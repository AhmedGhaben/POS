import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission } from "@prisma/client";
import { PermissionsService } from "../permissions/permissions.service";
import { PERMISSION_KEY } from "../decorators/requires-permission.decorator";
import { AuthenticatedUser } from "../types/authenticated-user";

/** Applied globally in AppModule; only routes with @RequiresPermission() are checked. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
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

    return this.permissionsService.hasPermission(user.userId, user.role, required);
  }
}
