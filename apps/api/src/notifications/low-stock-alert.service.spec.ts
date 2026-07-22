import { Role } from "@prisma/client";
import { LowStockAlertService } from "./low-stock-alert.service";

const STORE = { id: "store-1", businessId: "biz-1", name: "Main St", isActive: true };

function buildDeps(opts: {
  lowStockItems: Array<{ product: { name: string }; quantity: number; reorderLevel: number }>;
  users: Array<{ email: string }>;
}) {
  const prisma = {
    store: { findMany: jest.fn().mockResolvedValue([STORE]) },
    user: { findMany: jest.fn().mockResolvedValue(opts.users) },
  };
  const reports = { lowStock: jest.fn().mockResolvedValue(opts.lowStockItems) };
  const mail = { sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined) };
  return { prisma, reports, mail };
}

describe("LowStockAlertService#sendDailyAlerts", () => {
  it("does not email anyone when a store has no low-stock items", async () => {
    const { prisma, reports, mail } = buildDeps({ lowStockItems: [], users: [{ email: "owner@test.com" }] });
    const service = new LowStockAlertService(prisma as any, reports as any, mail as any);

    await service.sendDailyAlerts();

    expect(mail.sendLowStockAlertEmail).not.toHaveBeenCalled();
  });

  it("emails every recipient returned for the store when items are low", async () => {
    const { prisma, reports, mail } = buildDeps({
      lowStockItems: [{ product: { name: "Widget" }, quantity: 1, reorderLevel: 5 }],
      users: [{ email: "owner@test.com" }, { email: "manager@test.com" }],
    });
    const service = new LowStockAlertService(prisma as any, reports as any, mail as any);

    await service.sendDailyAlerts();

    expect(reports.lowStock).toHaveBeenCalledWith("store-1");
    expect(mail.sendLowStockAlertEmail).toHaveBeenCalledTimes(2);
    expect(mail.sendLowStockAlertEmail).toHaveBeenCalledWith("owner@test.com", {
      storeName: "Main St",
      items: [{ productName: "Widget", quantity: 1, reorderLevel: 5 }],
    });
  });

  it("scopes recipients to OWNER (business-wide) or MANAGER assigned to the store", async () => {
    const { prisma, reports } = buildDeps({
      lowStockItems: [{ product: { name: "Widget" }, quantity: 0, reorderLevel: 3 }],
      users: [],
    });
    const service = new LowStockAlertService(prisma as any, reports as any, { sendLowStockAlertEmail: jest.fn() } as any);

    await service.sendDailyAlerts();

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        isActive: true,
        OR: [{ role: Role.OWNER }, { role: Role.MANAGER, storeUsers: { some: { storeId: "store-1" } } }],
      },
      select: { email: true },
    });
  });

  it("keeps notifying remaining stores when one store's alert fails", async () => {
    const storeB = { id: "store-2", businessId: "biz-1", name: "Second St", isActive: true };
    const prisma = {
      store: { findMany: jest.fn().mockResolvedValue([STORE, storeB]) },
      user: { findMany: jest.fn().mockResolvedValue([{ email: "owner@test.com" }]) },
    };
    const reports = {
      lowStock: jest
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce([{ product: { name: "Widget" }, quantity: 0, reorderLevel: 1 }]),
    };
    const mail = { sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new LowStockAlertService(prisma as any, reports as any, mail as any);

    await service.sendDailyAlerts();

    expect(mail.sendLowStockAlertEmail).toHaveBeenCalledTimes(1);
  });
});
