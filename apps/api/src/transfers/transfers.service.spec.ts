import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TransfersService } from "./transfers.service";

const PRODUCT = { id: "prod-1", businessId: "biz-1", name: "Widget", trackStock: true, unit: "un", costPrice: 15 };
const STORE_A = { id: "store-a", businessId: "biz-1" };
const STORE_B = { id: "store-b", businessId: "biz-1" };

function buildPrismaMock(opts: { sourceQty: number; destExists: boolean }) {
  const transferCreate = jest.fn().mockImplementation(({ data }) => ({
    id: "transfer-1",
    ...data,
    lineItems: data.lineItems.create,
  }));
  const inventoryUpdate = jest.fn().mockResolvedValue({});
  // The locked rows: the source has `sourceQty` at 20 each; the destination 3 at 30 (or nothing).
  const inventoryUpsert = jest.fn().mockImplementation(({ where }) =>
    where.storeId_productId.storeId === "store-a"
      ? { quantity: opts.sourceQty, averageCost: 20 }
      : opts.destExists
        ? { quantity: 3, averageCost: 30 }
        : { quantity: 0, averageCost: 0 },
  );
  const tx = {
    inventoryItem: {
      update: inventoryUpdate,
      upsert: inventoryUpsert,
    },
    stockMovement: { create: jest.fn(({ data }) => ({ id: `mov-${data.type}`, ...data })) },
    stockTransfer: { create: transferCreate },
  };
  return {
    store: { findMany: jest.fn().mockResolvedValue([STORE_A, STORE_B]) },
    product: { findMany: jest.fn().mockResolvedValue([PRODUCT]) },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
}

describe("TransfersService#create", () => {
  it("rejects when source and destination are the same store", async () => {
    const prisma = buildPrismaMock({ sourceQty: 10, destExists: false });
    const service = new TransfersService(prisma as any);

    await expect(
      service.create("biz-1", "user-1", {
        fromStoreId: "store-a",
        toStoreId: "store-a",
        lineItems: [{ productId: "prod-1", quantity: 1 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when either store doesn't belong to the business", async () => {
    const prisma = {
      store: { findMany: jest.fn().mockResolvedValue([STORE_A]) }, // only one found
      product: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new TransfersService(prisma as any);

    await expect(
      service.create("biz-1", "user-1", {
        fromStoreId: "store-a",
        toStoreId: "store-b",
        lineItems: [{ productId: "prod-1", quantity: 1 }],
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects a product outside the business", async () => {
    const prisma = buildPrismaMock({ sourceQty: 10, destExists: false });
    prisma.product.findMany = jest.fn().mockResolvedValue([]);
    const service = new TransfersService(prisma as any);

    await expect(
      service.create("biz-1", "user-1", {
        fromStoreId: "store-a",
        toStoreId: "store-b",
        lineItems: [{ productId: "missing-product", quantity: 1 }],
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects insufficient stock at the source store", async () => {
    const prisma = buildPrismaMock({ sourceQty: 2, destExists: false });
    const service = new TransfersService(prisma as any);

    await expect(
      service.create("biz-1", "user-1", {
        fromStoreId: "store-a",
        toStoreId: "store-b",
        lineItems: [{ productId: "prod-1", quantity: 5 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("moves the stock out of the source at its average cost and into the destination at that cost", async () => {
    const prisma = buildPrismaMock({ sourceQty: 10, destExists: true });
    const service = new TransfersService(prisma as any);

    const transfer = await service.create("biz-1", "user-1", {
      fromStoreId: "store-a",
      toStoreId: "store-b",
      note: "Restocking store B",
      lineItems: [{ productId: "prod-1", quantity: 4 }],
    } as any);

    const updates = prisma.__tx.inventoryItem.update.mock.calls.map(([arg]: any[]) => ({
      store: arg.where.storeId_productId.storeId,
      quantity: arg.data.quantity.toNumber(),
      averageCost: arg.data.averageCost.toNumber(),
    }));
    // Source: 10 at 20 -> 6 at 20. Destination: 3 at 30 + 4 at 20 = 7 at 24.2857.
    expect(updates).toEqual([
      { store: "store-a", quantity: 6, averageCost: 20 },
      { store: "store-b", quantity: 7, averageCost: 24.2857 },
    ]);
    const movements = prisma.__tx.stockMovement.create.mock.calls.map(([arg]: any[]) => [arg.data.type, arg.data.quantity.toNumber(), arg.data.unitCost.toNumber(), arg.data.transferId]);
    expect(movements).toEqual([
      ["TRANSFER_OUT", -4, 20, "transfer-1"],
      ["TRANSFER_IN", 4, 20, "transfer-1"],
    ]);
    expect((transfer as any).fromStoreId).toBe("store-a");
    expect((transfer as any).toStoreId).toBe("store-b");
    expect((transfer as any).lineItems).toHaveLength(1);
  });
});
