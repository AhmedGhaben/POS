import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { Plan, Role } from "@prisma/client";
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
  emailVerifiedAt: new Date("2026-01-01"),
};

const REGISTER_DTO = {
  businessName: "Corner Cafe",
  storeName: "Main Street",
  firstName: "New",
  lastName: "Owner",
  email: "  New.Owner@Example.COM ",
  password: "password123",
  timezone: "Europe/Paris",
};

function buildPrismaMock() {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    business: { create: jest.fn().mockResolvedValue({ id: "biz-new" }) },
    store: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "store-new" }),
    },
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
    emailVerificationToken: {
      create: jest.fn().mockResolvedValue({ id: "evt-1" }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  // Supports both forms: an array of queries, or an interactive callback
  // (which gets the same mock as its `tx` client).
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
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
  const mail = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
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
      expect(result.user.emailVerified).toBe(true);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("looks the email up case-insensitively", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(OWNER);
      bcrypt.compare.mockResolvedValue(true);
      const { service } = buildService(prisma);

      await service.login(" Owner@Demo.TEST ", "correct-password");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "owner@demo.test" } });
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

  describe("register", () => {
    const NEW_OWNER = {
      ...OWNER,
      id: "user-new",
      businessId: "biz-new",
      email: "new.owner@example.com",
      firstName: "New",
      emailVerifiedAt: null,
    };

    it("creates business, store and owner in one transaction and logs in", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(NEW_OWNER);
      prisma.store.findMany.mockResolvedValue([{ id: "store-new" }]);
      const { service, mail } = buildService(prisma);

      const result = await service.register(REGISTER_DTO);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.business.create).toHaveBeenCalledWith({
        data: { name: "Corner Cafe", plan: Plan.SIMPLE },
      });
      expect(prisma.store.create).toHaveBeenCalledWith({
        data: { businessId: "biz-new", name: "Main Street", timezone: "Europe/Paris" },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId: "biz-new",
          email: "new.owner@example.com",
          passwordHash: "hashed-password",
          role: Role.OWNER,
        }),
      });
      expect(result.accessToken).toBe("signed-jwt");
      expect(result.user.emailVerified).toBe(false);
      expect(result.user.accessibleStoreIds).toEqual(["store-new"]);
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(mail.sendEmailVerificationEmail).toHaveBeenCalledWith(
        "new.owner@example.com",
        "New",
        expect.any(String),
      );
    });

    it("defaults the store timezone to UTC", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(NEW_OWNER);
      const { service } = buildService(prisma);

      await service.register({ ...REGISTER_DTO, timezone: undefined });

      expect(prisma.store.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ timezone: "UTC" }),
      });
    });

    it("rejects an email that's already in use, in any casing, with 409", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(OWNER);
      const { service } = buildService(prisma);

      await expect(service.register(REGISTER_DTO)).rejects.toThrow(ConflictException);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "new.owner@example.com" },
      });
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it("still signs the owner up when the verification email fails", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(NEW_OWNER);
      const { service, mail } = buildService(prisma);
      mail.sendEmailVerificationEmail.mockRejectedValue(new Error("mail down"));

      await expect(service.register(REGISTER_DTO)).resolves.toMatchObject({
        accessToken: "signed-jwt",
      });
    });
  });

  describe("verifyEmail", () => {
    function tokenRow(overrides: Record<string, unknown> = {}) {
      return {
        id: "evt-1",
        userId: OWNER.id,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      };
    }

    it("marks the user verified and the token used", async () => {
      const prisma = buildPrismaMock();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(tokenRow());
      const { service } = buildService(prisma);

      await service.verifyEmail("valid-token");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER.id },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: "evt-1" },
        data: { usedAt: expect.any(Date) },
      });
    });

    it("rejects an expired token", async () => {
      const prisma = buildPrismaMock();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        tokenRow({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const { service } = buildService(prisma);

      await expect(service.verifyEmail("expired")).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a token that was already used", async () => {
      const prisma = buildPrismaMock();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(tokenRow({ usedAt: new Date() }));
      const { service } = buildService(prisma);

      await expect(service.verifyEmail("used")).rejects.toThrow(BadRequestException);
    });
  });

  describe("resendVerification", () => {
    it("sends a new link to an unverified user", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ ...OWNER, emailVerifiedAt: null });
      const { service, mail } = buildService(prisma);

      await service.resendVerification(OWNER.id);

      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(mail.sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it("does nothing for an already-verified user", async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(OWNER);
      const { service, mail } = buildService(prisma);

      await service.resendVerification(OWNER.id);

      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(mail.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });
});
