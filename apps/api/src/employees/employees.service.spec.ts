import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { EmployeesService } from "./employees.service";

const BUSINESS_ID = "biz-1";
const LOGIN = { email: "cara@shop.test", role: Role.CASHIER, storeIds: ["store-1"], password: "password123" } as const;
const PREPARED = { ...LOGIN, passwordHash: "hashed", sendInvite: false };

function buildMocks() {
  const prisma = {
    employee: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    store: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const usersService = {
    prepareStaffLogin: jest.fn().mockResolvedValue(PREPARED),
    createStaffLoginInTx: jest.fn().mockResolvedValue({ userId: "user-new", inviteToken: null }),
    sendStaffInvite: jest.fn().mockResolvedValue(undefined),
  };
  const service = new EmployeesService(prisma as any, usersService as any);
  return { service, prisma, usersService };
}

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    businessId: BUSINESS_ID,
    firstName: "Cara",
    lastName: "Cashier",
    userId: "user-new",
    store: null,
    user: {
      id: "user-new",
      email: "cara@shop.test",
      role: Role.CASHIER,
      isActive: true,
      storeUsers: [{ storeId: "store-1" }],
    },
    ...overrides,
  };
}

describe("EmployeesService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("create", () => {
    it("creates the employee and its login in one transaction", async () => {
      const { service, prisma, usersService } = buildMocks();
      prisma.employee.create.mockResolvedValue(employeeRow());

      const result = await service.create(BUSINESS_ID, Role.OWNER, {
        firstName: "Cara",
        lastName: "Cashier",
        login: { ...LOGIN, storeIds: [...LOGIN.storeIds] },
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(usersService.createStaffLoginInTx).toHaveBeenCalledWith(
        prisma,
        BUSINESS_ID,
        expect.objectContaining({ firstName: "Cara", lastName: "Cashier" }),
        PREPARED,
      );
      expect(prisma.employee.create.mock.calls[0][0].data.userId).toBe("user-new");
      expect(result.user).toEqual({
        id: "user-new",
        email: "cara@shop.test",
        role: Role.CASHIER,
        isActive: true,
        storeIds: ["store-1"],
      });
      expect(usersService.sendStaffInvite).not.toHaveBeenCalled();
    });

    it("emails the invite after the transaction when inviting", async () => {
      const { service, prisma, usersService } = buildMocks();
      usersService.createStaffLoginInTx.mockResolvedValue({ userId: "user-new", inviteToken: "raw" });
      prisma.employee.create.mockResolvedValue(employeeRow());

      await service.create(BUSINESS_ID, Role.OWNER, {
        firstName: "Cara",
        lastName: "Cashier",
        login: { email: LOGIN.email, role: Role.CASHIER, storeIds: ["store-1"], sendInvite: true },
      });

      expect(usersService.sendStaffInvite).toHaveBeenCalledWith(BUSINESS_ID, "user-new", "raw");
    });

    it("forbids a manager from creating a login", async () => {
      const { service, usersService } = buildMocks();

      await expect(
        service.create(BUSINESS_ID, Role.MANAGER, {
          firstName: "Cara",
          lastName: "Cashier",
          login: { ...LOGIN, storeIds: [...LOGIN.storeIds] },
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(usersService.prepareStaffLogin).not.toHaveBeenCalled();
    });

    it("still lets a manager create an employee without a login", async () => {
      const { service, prisma, usersService } = buildMocks();
      prisma.employee.create.mockResolvedValue(employeeRow({ userId: null, user: null }));

      const result = await service.create(BUSINESS_ID, Role.MANAGER, { firstName: "Cara", lastName: "Cashier" });

      expect(result.user).toBeNull();
      expect(usersService.createStaffLoginInTx).not.toHaveBeenCalled();
    });
  });

  describe("createLogin", () => {
    it("creates a login and links it to the existing employee", async () => {
      const { service, prisma, usersService } = buildMocks();
      prisma.employee.findUnique.mockResolvedValue(employeeRow({ userId: null, user: null }));
      prisma.employee.update.mockResolvedValue(employeeRow());

      await service.createLogin(BUSINESS_ID, "emp-1", { ...LOGIN, storeIds: [...LOGIN.storeIds] });

      expect(usersService.createStaffLoginInTx).toHaveBeenCalledTimes(1);
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "emp-1" }, data: { userId: "user-new" } }),
      );
    });

    it("409s when the employee already has a login", async () => {
      const { service, prisma, usersService } = buildMocks();
      prisma.employee.findUnique.mockResolvedValue(employeeRow());

      await expect(
        service.createLogin(BUSINESS_ID, "emp-1", { ...LOGIN, storeIds: [...LOGIN.storeIds] }),
      ).rejects.toThrow(ConflictException);
      expect(usersService.prepareStaffLogin).not.toHaveBeenCalled();
    });

    it("404s for an employee in another business", async () => {
      const { service, prisma } = buildMocks();
      prisma.employee.findUnique.mockResolvedValue(employeeRow({ businessId: "other-biz", userId: null }));

      await expect(
        service.createLogin(BUSINESS_ID, "emp-1", { ...LOGIN, storeIds: [...LOGIN.storeIds] }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
