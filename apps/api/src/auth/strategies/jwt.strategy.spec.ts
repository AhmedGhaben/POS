import { UnauthorizedException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtStrategy } from "./jwt.strategy";

function buildStrategy(user: unknown, access: unknown = null) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) }, accountantAccess: { findFirst: jest.fn().mockResolvedValue(access) } };
  const config = { get: jest.fn().mockReturnValue("access-secret") };
  return { strategy: new JwtStrategy(config as any, prisma as any), prisma };
}

const PAYLOAD = { sub: "user-1", businessId: "biz-1", role: Role.CASHIER };

describe("JwtStrategy", () => {
  it("returns the user with their current role from the database", async () => {
    const { strategy } = buildStrategy({
      id: "user-1",
      businessId: "biz-1",
      role: Role.MANAGER,
      isActive: true,
    });

    await expect(strategy.validate(PAYLOAD)).resolves.toEqual({
      userId: "user-1",
      businessId: "biz-1",
      role: Role.MANAGER,
    });
  });

  it("rejects a deactivated user even though the token is still valid", async () => {
    const { strategy } = buildStrategy({
      id: "user-1",
      businessId: "biz-1",
      role: Role.CASHIER,
      isActive: false,
    });

    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a user that no longer exists", async () => {
    const { strategy } = buildStrategy(null);

    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  it("an accountant works in the client the token names, while it still gives them access", async () => {
    const accountant = { id: "user-1", businessId: "home", role: Role.ACCOUNTANT, isActive: true };
    await expect(buildStrategy(accountant, { id: "a1" }).strategy.validate({ ...PAYLOAD, businessId: "client-2" })).resolves.toEqual({ userId: "user-1", businessId: "client-2", role: Role.ACCOUNTANT });
    await expect(buildStrategy(accountant, null).strategy.validate({ ...PAYLOAD, businessId: "client-2" })).rejects.toThrow("Your access to this company was removed");
  });

  it("an invitation the accountant hasn't accepted gives no access", async () => {
    const accountant = { id: "user-1", businessId: "home", role: Role.ACCOUNTANT, isActive: true };
    const { strategy, prisma } = buildStrategy(accountant, { id: "a1" });
    await strategy.validate({ ...PAYLOAD, businessId: "client-2" });
    expect(prisma.accountantAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", businessId: "client-2", revokedAt: null, acceptedAt: { not: null } } }),
    );
  });
});
