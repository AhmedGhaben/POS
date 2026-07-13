import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthService } from "./auth.service";

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue("hashed-password"),
}));
// ts-jest doesn't hoist jest.mock() above `import` the way babel-jest does,
// so the mocked module must be pulled in via require() after jest.mock().
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require("bcrypt");

const OWNER: any = {
  id: "user-1",
  businessId: "biz-1",
  email: "owner@demo.test",
  passwordHash: "stored-hash",
  firstName: "Ann",
  lastName: "Owner",
  role: Role.OWNER,
  isActive: true,
};

function buildPrismaMock() {
  return {
    user: { findUnique: jest.fn(), update: jest.fn() },
    store: { findMany: jest.fn().mockResolvedValue([]) },
    storeUser: { findMany: jest.fn().mockResolvedValue([]) },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: "rt-1" }),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn().mockResolvedValue({ id: "prt-1" }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function buildService(prisma: ReturnType<typeof buildPrismaMock>) {
  const jwt = { sign: jest.fn().mockReturnValue("signed-jwt") };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: "access-secret",
        JWT_REFRESH_SECRET: "refresh-secret",
        JWT_ACCESS_TTL: "30m",
        JWT_REFRESH_TTL: "30d",
      };
      return values[key];
    }),
  };
  const mail = { sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(prisma as any, jwt as any, config as any, mail as any);
  return { service, jwt, mail };
}

describe("AuthService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("login", () => {
    it("returns tokens and user info on valid credentials", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(OWNER);
      bcrypt.compare.mockResolvedValue(true);
      const { service } = buildService(prisma);

      const result = await service.login("owner@demo.test", "correct-password");

      expect(result.accessToken).toBe("signed-jwt");
      expect(result.refreshToken).toHaveLength(64); // 32 random bytes, hex-encoded
      expect(result.user.role).toBe(Role.OWNER);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("rejects an unknown email", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      const { service } = buildService(prisma);

      await expect(service.login("nobody@demo.test", "whatever1")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects a wrong password", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(OWNER);
      bcrypt.compare.mockResolvedValue(false);
      const { service } = buildService(prisma);

      await expect(service.login("owner@demo.test", "wrong-password")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects a deactivated user", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ ...OWNER, isActive: false });
      const { service } = buildService(prisma);

      await expect(service.login("owner@demo.test", "correct-password")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("refresh", () => {
    it("rotates a valid token: revokes the old one and issues a new one", async () => {
      const prisma = buildPrismaMock();
      const stored = {
        id: "rt-old",
        userId: OWNER.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      };
      prisma.refreshToken.findUnique
        .mockResolvedValueOnce(stored) // lookup of the presented token
        .mockResolvedValueOnce({ id: "rt-new" }); // lookup of the newly-issued token by its hash
      prisma.user.findUnique.mockResolvedValue(OWNER);
      const { service } = buildService(prisma);

      const result = await service.refresh("some-raw-refresh-token");

      expect(result.accessToken).toBe("signed-jwt");
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: "rt-old" },
        data: { revokedAt: expect.any(Date), replacedByTokenId: "rt-new" },
      });
    });

    it("rejects a token that doesn't exist", async () => {
      const prisma = buildPrismaMock();
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      const { service } = buildService(prisma);

      await expect(service.refresh("bogus")).rejects.toThrow(UnauthorizedException);
    });

    it("rejects an expired token", async () => {
      const prisma = buildPrismaMock();
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-old",
        userId: OWNER.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      const { service } = buildService(prisma);

      await expect(service.refresh("expired-token")).rejects.toThrow(UnauthorizedException);
    });

    it("treats reuse of an already-revoked token as theft and revokes all sessions", async () => {
      const prisma = buildPrismaMock();
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-old",
        userId: OWNER.id,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const { service } = buildService(prisma);

      await expect(service.refresh("stolen-token")).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: OWNER.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe("resetPassword", () => {
    it("rejects an unknown or expired token", async () => {
      const prisma = buildPrismaMock();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      const { service } = buildService(prisma);

      await expect(service.resetPassword("bogus", "newpassword1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects an already-used token", async () => {
      const prisma = buildPrismaMock();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        userId: OWNER.id,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const { service } = buildService(prisma);

      await expect(service.resetPassword("used-token", "newpassword1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("updates the password and revokes every active refresh token on success", async () => {
      const prisma = buildPrismaMock();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        userId: OWNER.id,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const { service } = buildService(prisma);

      await service.resetPassword("valid-token", "newpassword1");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER.id },
        data: { passwordHash: "hashed-password" },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: "prt-1" },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: OWNER.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe("forgotPassword", () => {
    it("creates a reset token and emails it for a known active user", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(OWNER);
      const { service, mail } = buildService(prisma);

      await service.forgotPassword("owner@demo.test");

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith("owner@demo.test", expect.any(String));
    });

    it("silently no-ops for an unknown email (avoids user enumeration)", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      const { service, mail } = buildService(prisma);

      await expect(service.forgotPassword("nobody@demo.test")).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});
