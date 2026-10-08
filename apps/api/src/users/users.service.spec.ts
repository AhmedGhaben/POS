import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { UsersService } from "./users.service";
import { StaffRole } from "./dto/staff-login.dto";

jest.mock("bcrypt", () => ({ hash: jest.fn().mockResolvedValue("hashed-password") }));

const BUSINESS_ID = "biz-1";
const OWNER_ID = "owner-1";
const CASHIER = {
  id: "cashier-1",
  businessId: BUSINESS_ID,
  email: "cara@shop.test",
  firstName: "Cara",
  role: Role.CASHIER,
  isActive: true,
};

function buildPrismaMock() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: "user-new" }),
      update: jest.fn(),
    },
    business: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: "Corner Cafe" }) },
    store: { count: jest.fn() },
    storeUser: { createMany: jest.fn(), deleteMany: jest.fn() },
    passwordResetToken: { create: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

function buildService(prisma = buildPrismaMock()) {
  const mail = { sendStaffInviteEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new UsersService(prisma as any, {} as any, mail as any);
  return { service, prisma, mail };
}

const LOGIN = { email: " Cara@Shop.TEST ", role: Role.CASHIER as StaffRole, storeIds: ["store-1"] };

describe("UsersService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("prepareStaffLogin", () => {
    it("normalizes the email and hashes the given password", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.store.count.mockResolvedValue(1);

      const prepared = await service.prepareStaffLogin(BUSINESS_ID, { ...LOGIN, password: "password123" });

      expect(prepared).toEqual({
        email: "cara@shop.test",
        role: Role.CASHIER,
        storeIds: ["store-1"],
        passwordHash: "hashed-password",
        sendInvite: false,
      });
    });

    it("rejects a store from another business (404)", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.store.count.mockResolvedValue(0);

      await expect(
        service.prepareStaffLogin(BUSINESS_ID, { ...LOGIN, password: "password123" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.store.count).toHaveBeenCalledWith({
        where: { id: { in: ["store-1"] }, businessId: BUSINESS_ID },
      });
    });

    it("rejects an email already in use (409)", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(CASHIER);

      await expect(
        service.prepareStaffLogin(BUSINESS_ID, { ...LOGIN, password: "password123" }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects both a password and an invite (400)", async () => {
      const { service } = buildService();

      await expect(
        service.prepareStaffLogin(BUSINESS_ID, { ...LOGIN, password: "password123", sendInvite: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createStaffLoginInTx", () => {
    const PREPARED = {
      email: "cara@shop.test",
      role: Role.CASHIER,
      storeIds: ["store-1", "store-2"],
      passwordHash: "hashed-password",
      sendInvite: false,
    } as const;

    it("creates a verified user with access to each store and no invite", async () => {
      const { service, prisma } = buildService();

      const result = await service.createStaffLoginInTx(
        prisma as any,
        BUSINESS_ID,
        { firstName: "Cara", lastName: "Cashier" },
        { ...PREPARED, storeIds: [...PREPARED.storeIds] },
      );

      expect(result).toEqual({ userId: "user-new", inviteToken: null });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: Role.CASHIER, emailVerifiedAt: expect.any(Date) }),
      });
      expect(prisma.storeUser.createMany).toHaveBeenCalledWith({
        data: [
          { userId: "user-new", storeId: "store-1" },
          { userId: "user-new", storeId: "store-2" },
        ],
      });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("creates a 72h invite token when inviting", async () => {
      const { service, prisma } = buildService();

      const result = await service.createStaffLoginInTx(
        prisma as any,
        BUSINESS_ID,
        { firstName: "Cara", lastName: "Cashier" },
        { ...PREPARED, storeIds: [...PREPARED.storeIds], sendInvite: true },
      );

      expect(result.inviteToken).toHaveLength(64);
      const { expiresAt } = prisma.passwordResetToken.create.mock.calls[0][0].data;
      const hours = (expiresAt.getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(71.9);
      expect(hours).toBeLessThanOrEqual(72);
    });
  });

  describe("updateStaffAccess", () => {
    it("replaces store access and changes the role", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(CASHIER);
      prisma.store.count.mockResolvedValue(1);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: CASHIER.id,
        email: CASHIER.email,
        role: Role.MANAGER,
        isActive: true,
        storeUsers: [{ storeId: "store-2" }],
      });

      const result = await service.updateStaffAccess(BUSINESS_ID, OWNER_ID, CASHIER.id, {
        role: Role.MANAGER,
        storeIds: ["store-2"],
      });

      expect(prisma.storeUser.deleteMany).toHaveBeenCalledWith({
        where: { userId: CASHIER.id, storeId: { notIn: ["store-2"] } },
      });
      expect(prisma.storeUser.createMany).toHaveBeenCalledWith({
        data: [{ userId: CASHIER.id, storeId: "store-2" }],
        skipDuplicates: true,
      });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: CASHIER.id,
        email: CASHIER.email,
        role: Role.MANAGER,
        isActive: true,
        storeIds: ["store-2"],
      });
    });

    it("revokes refresh tokens when deactivating", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(CASHIER);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...CASHIER, isActive: false, storeUsers: [] });

      await service.updateStaffAccess(BUSINESS_ID, OWNER_ID, CASHIER.id, { isActive: false });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: CASHIER.id },
        data: { role: undefined, isActive: false },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: CASHIER.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("refuses to let the owner change their own access", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ ...CASHIER, id: OWNER_ID, role: Role.OWNER });

      await expect(
        service.updateStaffAccess(BUSINESS_ID, OWNER_ID, OWNER_ID, { isActive: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("refuses to change another owner", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ ...CASHIER, role: Role.OWNER });

      await expect(
        service.updateStaffAccess(BUSINESS_ID, OWNER_ID, CASHIER.id, { isActive: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("404s for a user in another business", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ ...CASHIER, businessId: "other-biz" });

      await expect(
        service.updateStaffAccess(BUSINESS_ID, OWNER_ID, CASHIER.id, { isActive: false }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("sendStaffInvite", () => {
    it("emails the invite link with the business name", async () => {
      const { service, prisma, mail } = buildService();
      prisma.user.findUniqueOrThrow.mockResolvedValue(CASHIER);

      await service.sendStaffInvite(BUSINESS_ID, CASHIER.id, "raw-token");

      expect(mail.sendStaffInviteEmail).toHaveBeenCalledWith("cara@shop.test", {
        firstName: "Cara",
        businessName: "Corner Cafe",
        token: "raw-token",
      });
    });

    it("swallows mail failures", async () => {
      const { service, prisma, mail } = buildService();
      prisma.user.findUniqueOrThrow.mockResolvedValue(CASHIER);
      mail.sendStaffInviteEmail.mockRejectedValue(new Error("mail down"));

      await expect(service.sendStaffInvite(BUSINESS_ID, CASHIER.id, "raw-token")).resolves.toBeUndefined();
    });
  });
});
