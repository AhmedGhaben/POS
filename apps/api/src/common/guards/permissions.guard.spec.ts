import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission, Role } from "@prisma/client";
import { PermissionsGuard } from "./permissions.guard";

function buildContext(
  user: { userId: string; businessId?: string; role: Role } | undefined,
  headers: Record<string, string> = {},
): { context: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { user, headers };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function requiring(permission: Permission | undefined) {
  return { getAllAndOverride: jest.fn().mockReturnValue(permission) } as unknown as Reflector;
}

describe("PermissionsGuard", () => {
  it("allows any request through when no @RequiresPermission() is set", async () => {
    const permissionsService = { hasPermission: jest.fn() };
    const guard = new PermissionsGuard(requiring(undefined), permissionsService as any, {} as any);

    await expect(guard.canActivate(buildContext({ userId: "u1", role: Role.CASHIER }).context)).resolves.toBe(true);
    expect(permissionsService.hasPermission).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request when a permission is required", async () => {
    const guard = new PermissionsGuard(requiring(Permission.PROCESS_RETURN), { hasPermission: jest.fn() } as any, {} as any);
    await expect(guard.canActivate(buildContext(undefined).context)).resolves.toBe(false);
  });

  it("delegates to PermissionsService for an authenticated request", async () => {
    const permissionsService = { hasPermission: jest.fn().mockResolvedValue(true) };
    const guard = new PermissionsGuard(requiring(Permission.PROCESS_RETURN), permissionsService as any, {} as any);

    await expect(guard.canActivate(buildContext({ userId: "u1", role: Role.MANAGER }).context)).resolves.toBe(true);
    expect(permissionsService.hasPermission).toHaveBeenCalledWith("u1", Role.MANAGER, Permission.PROCESS_RETURN);
  });

  it("refuses someone without the permission and without an approval", async () => {
    const overrides = { consume: jest.fn() };
    const guard = new PermissionsGuard(requiring(Permission.VOID_SALE), { hasPermission: jest.fn().mockResolvedValue(false) } as any, overrides as any);
    await expect(guard.canActivate(buildContext({ userId: "c1", role: Role.CASHIER }).context)).resolves.toBe(false);
    expect(overrides.consume).not.toHaveBeenCalled();
  });

  it("lets them through once with a manager's approval, for that permission", async () => {
    const used = { id: "o1", approvedById: "m1", permission: Permission.VOID_SALE };
    const overrides = { consume: jest.fn().mockResolvedValue(used) };
    const guard = new PermissionsGuard(requiring(Permission.VOID_SALE), { hasPermission: jest.fn().mockResolvedValue(false) } as any, overrides as any);
    const user = { userId: "c1", businessId: "b1", role: Role.CASHIER };
    const { context, request } = buildContext(user, { "x-override-token": "tok" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(overrides.consume).toHaveBeenCalledWith("tok", user, Permission.VOID_SALE);
    expect(request.override).toBe(used);
  });

  it("refuses an approval that's used, expired or someone else's", async () => {
    const overrides = { consume: jest.fn().mockRejectedValue(new ForbiddenException("no")) };
    const guard = new PermissionsGuard(requiring(Permission.VOID_SALE), { hasPermission: jest.fn().mockResolvedValue(false) } as any, overrides as any);
    const { context } = buildContext({ userId: "c1", businessId: "b1", role: Role.CASHIER }, { "x-override-token": "old" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
