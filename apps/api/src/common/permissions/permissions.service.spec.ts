import { Permission, Role } from "@prisma/client";
import { PermissionsService } from "./permissions.service";

function buildPrismaMock() {
  return {
    userPermission: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

describe("PermissionsService", () => {
  it("falls back to the role default when no override exists", async () => {
    const prisma = buildPrismaMock();
    prisma.userPermission.findUnique.mockResolvedValue(null);
    const service = new PermissionsService(prisma as any);

    await expect(service.hasPermission("u1", Role.CASHIER, Permission.VIEW_COST_PRICE)).resolves.toBe(
      false,
    );
    await expect(service.hasPermission("u1", Role.OWNER, Permission.VIEW_COST_PRICE)).resolves.toBe(
      true,
    );
  });

  it("an override wins over the role default in either direction", async () => {
    const prisma = buildPrismaMock();
    const service = new PermissionsService(prisma as any);

    prisma.userPermission.findUnique.mockResolvedValue({ granted: true });
    await expect(service.hasPermission("u1", Role.CASHIER, Permission.PROCESS_RETURN)).resolves.toBe(
      true,
    );

    prisma.userPermission.findUnique.mockResolvedValue({ granted: false });
    await expect(service.hasPermission("u1", Role.OWNER, Permission.PROCESS_RETURN)).resolves.toBe(
      false,
    );
  });

  it("getEffectivePermissions merges overrides onto role defaults", async () => {
    const prisma = buildPrismaMock();
    prisma.userPermission.findMany.mockResolvedValue([
      { permission: Permission.PROCESS_RETURN, granted: true },
    ]);
    const service = new PermissionsService(prisma as any);

    const result = await service.getEffectivePermissions("u1", Role.CASHIER);

    expect(result[Permission.PROCESS_RETURN]).toBe(true); // overridden
    expect(result[Permission.VIEW_COST_PRICE]).toBe(false); // role default
  });

  describe("setOverride", () => {
    it("upserts an explicit grant/revoke", async () => {
      const prisma = buildPrismaMock();
      const service = new PermissionsService(prisma as any);

      await service.setOverride("u1", Permission.PROCESS_RETURN, true);

      expect(prisma.userPermission.upsert).toHaveBeenCalledWith({
        where: { userId_permission: { userId: "u1", permission: Permission.PROCESS_RETURN } },
        create: { userId: "u1", permission: Permission.PROCESS_RETURN, granted: true },
        update: { granted: true },
      });
    });

    it("clears the override when granted is null", async () => {
      const prisma = buildPrismaMock();
      const service = new PermissionsService(prisma as any);

      await service.setOverride("u1", Permission.PROCESS_RETURN, null);

      expect(prisma.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1", permission: Permission.PROCESS_RETURN },
      });
      expect(prisma.userPermission.upsert).not.toHaveBeenCalled();
    });
  });
});
