import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import { SalesService } from "./sales.service";

function buildProduct(sellPrice: number, taxRate = 0) {
  return {
    id: "prod-1",
    businessId: "biz-1",
    name: "Widget",
    sellPrice: new Prisma.Decimal(sellPrice),
    taxRate: new Prisma.Decimal(taxRate),
  };
}

function buildPrismaMock(product: ReturnType<typeof buildProduct>, stockQty: number) {
  // Mimics what Prisma actually returns for a nested `{ create: [...] }` write
  // under `include` — the resolved rows, not the write-input wrapper.
  const saleCreate = jest.fn().mockImplementation(({ data }) => ({
    id: "sale-1",
    ...data,
    lineItems: data.lineItems.create,
    payments: data.payments.create,
  }));
  const tx = {
    inventoryItem: {
      findUnique: jest.fn().mockResolvedValue({ quantity: stockQty }),
      update: jest.fn().mockResolvedValue({}),
    },
    sale: { create: saleCreate },
  };
  return {
    product: { findMany: jest.fn().mockResolvedValue([product]) },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
}

describe("SalesService#create", () => {
  it("throws if a line item references a product outside the business", async () => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue([]) }, $transaction: jest.fn() };
    const service = new SalesService(prisma as any);

    await expect(
      service.create("biz-1", "cashier-1", {
        storeId: "store-1",
        payments: [{ method: PaymentMethod.CASH, amount: 10 }],
        lineItems: [{ productId: "missing-product", quantity: 1 }],
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects when payment amounts don't cover the total", async () => {
    const product = buildProduct(10);
    const prisma = buildPrismaMock(product, 5);
    const service = new SalesService(prisma as any);

    await expect(
      service.create("biz-1", "cashier-1", {
        storeId: "store-1",
        payments: [{ method: PaymentMethod.CASH, amount: 5 }], // total is 10, short by 5
        lineItems: [{ productId: "prod-1", quantity: 1 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a cash leg where tendered is less than the amount", async () => {
    const product = buildProduct(10);
    const prisma = buildPrismaMock(product, 5);
    const service = new SalesService(prisma as any);

    await expect(
      service.create("biz-1", "cashier-1", {
        storeId: "store-1",
        payments: [{ method: PaymentMethod.CASH, amount: 10, tendered: 5 }],
        lineItems: [{ productId: "prod-1", quantity: 1 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects insufficient stock", async () => {
    const product = buildProduct(10);
    const prisma = buildPrismaMock(product, 0);
    const service = new SalesService(prisma as any);

    await expect(
      service.create("biz-1", "cashier-1", {
        storeId: "store-1",
        payments: [{ method: PaymentMethod.CASH, amount: 10 }],
        lineItems: [{ productId: "prod-1", quantity: 1 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("computes tendered/change for a single cash payment", async () => {
    const product = buildProduct(10);
    const prisma = buildPrismaMock(product, 5);
    const service = new SalesService(prisma as any);

    const sale = await service.create("biz-1", "cashier-1", {
      storeId: "store-1",
      payments: [{ method: PaymentMethod.CASH, amount: 10, tendered: 20 }],
      lineItems: [{ productId: "prod-1", quantity: 1 }],
    } as any);

    expect(String((sale as any).amountTendered)).toBe("20");
    expect(String((sale as any).changeDue)).toBe("10");
    expect((sale as any).paymentMethod).toBe(PaymentMethod.CASH);
    expect((sale as any).payments).toHaveLength(1);
  });

  it("splits a sale across cash and card and only tracks tendered/change for the cash leg", async () => {
    const product = buildProduct(10);
    const prisma = buildPrismaMock(product, 5);
    const service = new SalesService(prisma as any);

    const sale = await service.create("biz-1", "cashier-1", {
      storeId: "store-1",
      payments: [
        { method: PaymentMethod.CASH, amount: 4, tendered: 5 },
        { method: PaymentMethod.CARD, amount: 6 },
      ],
      lineItems: [{ productId: "prod-1", quantity: 1 }],
    } as any);

    expect(String((sale as any).amountTendered)).toBe("5");
    expect(String((sale as any).changeDue)).toBe("1");
    expect((sale as any).paymentMethod).toBe(PaymentMethod.CASH);
    expect((sale as any).payments).toHaveLength(2);
    const cardLeg = (sale as any).payments.find((p: any) => p.method === PaymentMethod.CARD);
    expect(cardLeg.tendered).toBeNull();
    expect(cardLeg.change).toBeNull();
  });
});
