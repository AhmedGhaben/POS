import { UnauthorizedException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtStrategy } from "./jwt.strategy";

function buildStrategy(user: unknown) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
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
});
