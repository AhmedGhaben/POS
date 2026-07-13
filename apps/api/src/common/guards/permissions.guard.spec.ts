import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission, Role } from "@prisma/client";
import { PermissionsGuard } from "./permissions.guard";

function buildContext(user: { userId: string; role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  it("allows any request through when no @RequiresPermission() is set", async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const permissionsService = { hasPermission: jest.fn() };
    const guard = new PermissionsGuard(reflector, permissionsService as any);

    await expect(guard.canActivate(buildContext({ userId: "u1", role: Role.CASHIER }))).resolves.toBe(
      true,
    );
    expect(permissionsService.hasPermission).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request when a permission is required", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(Permission.PROCESS_RETURN),
    } as unknown as Reflector;
    const permissionsService = { hasPermission: jest.fn() };
    const guard = new PermissionsGuard(reflector, permissionsService as any);

    await expect(guard.canActivate(buildContext(undefined))).resolves.toBe(false);
  });

  it("delegates to PermissionsService for an authenticated request", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(Permission.PROCESS_RETURN),
    } as unknown as Reflector;
    const permissionsService = { hasPermission: jest.fn().mockResolvedValue(true) };
    const guard = new PermissionsGuard(reflector, permissionsService as any);

    const context = buildContext({ userId: "u1", role: Role.MANAGER });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(permissionsService.hasPermission).toHaveBeenCalledWith(
      "u1",
      Role.MANAGER,
      Permission.PROCESS_RETURN,
    );
  });
});
