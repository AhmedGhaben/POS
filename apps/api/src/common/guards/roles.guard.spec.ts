import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@prisma/client";
import { RolesGuard } from "./roles.guard";

function buildContext(user: { role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("allows any authenticated user through when no @Roles() is set", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ role: Role.CASHIER }))).toBe(true);
  });

  it("allows a user whose role is in the required list", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.OWNER, Role.MANAGER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ role: Role.MANAGER }))).toBe(true);
  });

  it("rejects a user whose role is not in the required list", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.OWNER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ role: Role.CASHIER }))).toBe(false);
  });

  it("rejects an unauthenticated request when roles are required", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.OWNER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });
});
