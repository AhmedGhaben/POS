import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TransfersService } from "./transfers.service";

const PRODUCT = { id: "prod-1", businessId: "biz-1", name: "Widget" };
const STORE_A = { id: "store-a", businessId: "biz-1" };
const STORE_B = { id: "store-b", businessId: "biz-1" };

function buildPrismaMock(opts: { sourceQty: number; destExists: boolean }) {
  const transferCreate = jest.fn().mockImplementation(({ data }) => ({
    id: "transfer-1",
    ...data,
    lineItems: data.lineItems.create,
  }));
  const inventoryUpdate = jest.fn().mockResolvedValue({});
  const inventoryUpsert = jest.fn().mockResolvedValue({});
  const tx = {
    inventoryItem: {
      findUnique: jest.fn().mockResolvedValue(
        opts.sourceQty === -1 ? null : { quantity: opts.sourceQty },
      ),
      update: inventoryUpdate,
      upsert: inventoryUpsert,
    },
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

  it("decrements the source and upserts the destination on success", async () => {
    const prisma = buildPrismaMock({ sourceQty: 10, destExists: false });
    const service = new TransfersService(prisma as any);

    const transfer = await service.create("biz-1", "user-1", {
      fromStoreId: "store-a",
      toStoreId: "store-b",
      note: "Restocking store B",
      lineItems: [{ productId: "prod-1", quantity: 4 }],
    } as any);

    expect(prisma.__tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { storeId_productId: { storeId: "store-a", productId: "prod-1" } },
      data: { quantity: { decrement: 4 } },
    });
    expect(prisma.__tx.inventoryItem.upsert).toHaveBeenCalledWith({
      where: { storeId_productId: { storeId: "store-b", productId: "prod-1" } },
      create: { storeId: "store-b", productId: "prod-1", quantity: 4 },
      update: { quantity: { increment: 4 } },
    });
    expect((transfer as any).fromStoreId).toBe("store-a");
    expect((transfer as any).toStoreId).toBe("store-b");
    expect((transfer as any).lineItems).toHaveLength(1);
  });
});
