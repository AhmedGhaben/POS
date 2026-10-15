import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Permission, Prisma, ShiftStatus } from "@prisma/client";
import { offlineReceiptNumber, SalesService } from "./sales.service";

const SHIFT = "9b1c3a52-4c1e-4d6f-9a77-2f1b0c3d4e5f";

function buildProduct(sellPrice: number, taxRate = 0, trackStock = true, extra: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    businessId: "biz-1",
    name: "Widget",
    sku: "W-1",
    sellPrice: new Prisma.Decimal(sellPrice),
    costPrice: new Prisma.Decimal(6),
    taxRate: new Prisma.Decimal(taxRate),
    taxCode: taxRate > 0 ? "NOR" : "ISE",
    exemptionCode: null as string | null,
    unit: "un",
    trackStock,
    ...extra,
  };
}

function buildMailMock() {
  return { sendReceiptEmail: jest.fn().mockResolvedValue(undefined) };
}

interface MockOptions {
  stockQty?: number;
  shift?: { id: string; status: ShiftStatus; openedById: string; terminalId: string | null } | null;
  store?: { country: string; ivaRegime: string; pricesIncludeTax: boolean };
}

function buildPrismaMock(
  product: ReturnType<typeof buildProduct>,
  { stockQty = 5, shift, store = { country: "AO", ivaRegime: "GERAL", pricesIncludeTax: false } }: MockOptions = {},
) {
  // Mimics what Prisma actually returns for a nested `{ create: [...] }` write
  // under `include`: the resolved rows, not the write-input wrapper.
  let created: unknown = null;
  const saleCreate = jest.fn().mockImplementation(({ data }) => {
    created = { id: "sale-1", ...data, lineItems: data.lineItems.create, payments: data.payments.create };
    return created;
  });
  const tx = {
    inventoryItem: {
      findUnique: jest.fn().mockResolvedValue({ quantity: stockQty }),
      update: jest.fn().mockResolvedValue({}),
      // The locked row recordMovement reads: stock and its average cost.
      upsert: jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(stockQty), averageCost: new Prisma.Decimal(7.5) }),
    },
    stockMovement: {
      create: jest.fn(({ data }) => ({ id: "mov-1", ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // The sale is read back after its Factura-Recibo is issued.
    sale: { create: saleCreate, findUniqueOrThrow: jest.fn(() => created) },
  };
  return {
    product: { findMany: jest.fn().mockResolvedValue([product]) },
    store: { findFirst: jest.fn().mockResolvedValue(store) },
    sale: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    shift: {
      findUnique: jest
        .fn()
        .mockResolvedValue(shift === undefined ? { id: "shift-1", status: ShiftStatus.OPEN, openedById: "cashier-1", terminalId: null } : shift),
    },
    customer: { findFirst: jest.fn().mockResolvedValue({ id: "final-consumer" }) },
    business: { findUnique: jest.fn().mockResolvedValue({ maxDiscountPercent: null }) },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
}

function buildFiscalMock() {
  return { issuer: jest.fn().mockResolvedValue({}), issueForSale: jest.fn().mockResolvedValue({}), annulForSale: jest.fn() };
}

function buildService(prisma: unknown, opts: { permissions?: Permission[]; overrides?: Record<string, jest.Mock> } = {}) {
  const permissions = { hasPermission: jest.fn(async (_u: string, _r: string, p: Permission) => (opts.permissions ?? []).includes(p)) };
  const overrides = opts.overrides ?? { consume: jest.fn(), recordOffline: jest.fn() };
  const fiscal = buildFiscalMock();
  return { service: new SalesService(prisma as any, buildMailMock() as any, permissions as any, overrides as any, fiscal as any), overrides, fiscal };
}

function saleDto(extra: Record<string, unknown> = {}) {
  return {
    storeId: "store-1",
    shiftClientId: SHIFT,
    payments: [{ method: PaymentMethod.CASH, amount: 10 }],
    lineItems: [{ productId: "prod-1", quantity: 1 }],
    ...extra,
  } as any;
}

describe("SalesService#create", () => {
  it("throws if a line item references a product outside the business", async () => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue([]) }, $transaction: jest.fn() };
    const { service } = buildService(prisma);
    await expect(service.create("biz-1", "cashier-1", saleDto({ lineItems: [{ productId: "missing", quantity: 1 }] }))).rejects.toThrow(
      NotFoundException,
    );
  });

  it("rejects when payment amounts don't cover the total", async () => {
    const { service } = buildService(buildPrismaMock(buildProduct(10)));
    await expect(service.create("biz-1", "cashier-1", saleDto({ payments: [{ method: PaymentMethod.CASH, amount: 5 }] }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects a cash leg where tendered is less than the amount", async () => {
    const { service } = buildService(buildPrismaMock(buildProduct(10)));
    await expect(
      service.create("biz-1", "cashier-1", saleDto({ payments: [{ method: PaymentMethod.CASH, amount: 10, tendered: 5 }] })),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects insufficient stock", async () => {
    const { service } = buildService(buildPrismaMock(buildProduct(10), { stockQty: 0 }));
    await expect(service.create("biz-1", "cashier-1", saleDto())).rejects.toThrow(BadRequestException);
  });

  it("computes tendered/change for a single cash payment", async () => {
    const { service } = buildService(buildPrismaMock(buildProduct(10)));
    const sale = await service.create("biz-1", "cashier-1", saleDto({ payments: [{ method: PaymentMethod.CASH, amount: 10, tendered: 20 }] }));

    expect(String((sale as any).amountTendered)).toBe("20");
    expect(String((sale as any).changeDue)).toBe("10");
    expect((sale as any).paymentMethod).toBe(PaymentMethod.CASH);
    expect((sale as any).payments).toHaveLength(1);
  });

  it("splits a sale across cash and card and only tracks tendered/change for the cash leg", async () => {
    const { service } = buildService(buildPrismaMock(buildProduct(10)));
    const sale = await service.create(
      "biz-1",
      "cashier-1",
      saleDto({
        payments: [
          { method: PaymentMethod.CASH, amount: 4, tendered: 5 },
          { method: PaymentMethod.CARD, amount: 6 },
        ],
      }),
    );

    expect(String((sale as any).amountTendered)).toBe("5");
    expect(String((sale as any).changeDue)).toBe("1");
    expect((sale as any).payments).toHaveLength(2);
    const cardLeg = (sale as any).payments.find((p: any) => p.method === PaymentMethod.CARD);
    expect(cardLeg.tendered).toBeNull();
    expect(cardLeg.change).toBeNull();
  });

  describe("shifts", () => {
    it("refuses an online sale without a shift", async () => {
      const { service } = buildService(buildPrismaMock(buildProduct(10)));
      await expect(service.create("biz-1", "cashier-1", saleDto({ shiftClientId: undefined }))).rejects.toThrow("Open a shift before selling");
    });

    it("refuses a closed shift, and someone else's", async () => {
      const closed = buildService(buildPrismaMock(buildProduct(10), { shift: { id: "s", status: ShiftStatus.CLOSED, openedById: "cashier-1", terminalId: null } }));
      await expect(closed.service.create("biz-1", "cashier-1", saleDto())).rejects.toThrow(BadRequestException);

      const other = buildService(buildPrismaMock(buildProduct(10), { shift: { id: "s", status: ShiftStatus.OPEN, openedById: "cashier-2", terminalId: null } }));
      await expect(other.service.create("biz-1", "cashier-1", saleDto())).rejects.toThrow(ForbiddenException);
    });

    it("records the sale in its shift", async () => {
      const prisma = buildPrismaMock(buildProduct(10));
      const { service } = buildService(prisma);
      const sale = await service.create("biz-1", "cashier-1", saleDto());
      expect((sale as any).shiftId).toBe("shift-1");
    });

    it("keeps an offline sale queued by an older app with no shift", async () => {
      const prisma = buildPrismaMock(buildProduct(10));
      const { service } = buildService(prisma);
      const sale = await service.create(
        "biz-1",
        "cashier-1",
        saleDto({ shiftClientId: undefined, clientId: "1f0e2d3c-4b5a-4968-8776-655443322110", offline: { createdAt: new Date().toISOString() } }),
      );
      expect((sale as any).shiftId).toBeNull();
    });

    it("asks the till to retry an offline sale whose shift hasn't uploaded yet", async () => {
      const prisma = buildPrismaMock(buildProduct(10), { shift: null });
      const { service } = buildService(prisma);
      await expect(
        service.create("biz-1", "cashier-1", saleDto({ clientId: "1f0e2d3c-4b5a-4968-8776-655443322111", offline: { createdAt: new Date().toISOString() } })),
      ).rejects.toThrow(ConflictException);
    });
  });

  it("goes to Consumidor Final when no customer is chosen", async () => {
    const { service } = buildService(buildPrismaMock(buildProduct(10)));
    const sale = await service.create("biz-1", "cashier-1", saleDto());
    expect((sale as any).customerId).toBe("final-consumer");
    const chosen = await service.create("biz-1", "cashier-1", saleDto({ customerId: "cust-9" }));
    expect((chosen as any).customerId).toBe("cust-9");
  });

  it("never checks or moves stock for a product that doesn't track it", async () => {
    const prisma = buildPrismaMock(buildProduct(10, 0, false), { stockQty: 0 });
    const { service } = buildService(prisma);
    await service.create("biz-1", "cashier-1", saleDto());
    expect(prisma.__tx.inventoryItem.upsert).not.toHaveBeenCalled();
    expect(prisma.__tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.__tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("records the stock movement at the average cost and links it to the sale", async () => {
    const prisma = buildPrismaMock(buildProduct(10));
    const { service } = buildService(prisma);
    const sale = await service.create("biz-1", "cashier-1", saleDto({ lineItems: [{ productId: "prod-1", quantity: 2 }], payments: [{ method: PaymentMethod.CASH, amount: 20 }] }));
    const movement = prisma.__tx.stockMovement.create.mock.calls[0][0].data;
    expect(movement).toMatchObject({ type: "SALE", storeId: "store-1", productId: "prod-1" });
    expect(movement.quantity.toNumber()).toBe(-2);
    expect(movement.balance.toNumber()).toBe(3);
    expect(prisma.__tx.stockMovement.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["mov-1"] } }, data: { saleId: "sale-1" } });
    expect(String((sale as any).lineItems[0].unitCost)).toBe("7.5");
  });

  describe("tax and units (Angola phase 6)", () => {
    it("prices with IVA: the total is the shelf price and the tax is worked out of it, rounded up", async () => {
      const prisma = buildPrismaMock(buildProduct(10, 14), { store: { country: "AO", ivaRegime: "GERAL", pricesIncludeTax: true } });
      const { service } = buildService(prisma);
      const sale = (await service.create("biz-1", "cashier-1", saleDto())) as any;
      // 10.00 x 14/114 = 1.228 -> 1.23
      expect(String(sale.total)).toBe("10");
      expect(String(sale.taxTotal)).toBe("1.23");
      expect(sale.pricesIncludeTax).toBe(true);
      expect(sale.lineItems[0]).toMatchObject({ taxCode: "NOR", exemptionCode: null, unit: "un" });
      expect(String(sale.lineItems[0].taxRate)).toBe("14");
    });

    it("Regime Simplificado: every line is exempt with M00, whatever the product's rate", async () => {
      const prisma = buildPrismaMock(buildProduct(10, 14), { store: { country: "AO", ivaRegime: "SIMPLIFICADO", pricesIncludeTax: true } });
      const { service } = buildService(prisma);
      const sale = (await service.create("biz-1", "cashier-1", saleDto())) as any;
      expect(String(sale.taxTotal)).toBe("0");
      expect(sale.lineItems[0]).toMatchObject({ taxCode: "ISE", exemptionCode: "M00" });
    });

    it("an exempt product carries its exemption reason", async () => {
      const prisma = buildPrismaMock(buildProduct(10, 0, true, { exemptionCode: "M10" }));
      const { service } = buildService(prisma);
      const sale = (await service.create("biz-1", "cashier-1", saleDto())) as any;
      expect(sale.lineItems[0]).toMatchObject({ taxCode: "ISE", exemptionCode: "M10" });
    });

    it("decimal quantities for products sold by weight, whole numbers for 'un'", async () => {
      const kg = buildService(buildPrismaMock(buildProduct(1250, 0, true, { unit: "kg" })));
      const sale = (await kg.service.create(
        "biz-1",
        "cashier-1",
        saleDto({ lineItems: [{ productId: "prod-1", quantity: 0.765 }], payments: [{ method: PaymentMethod.CASH, amount: 956.25 }] }),
      )) as any;
      expect(String(sale.total)).toBe("956.25");
      expect(sale.lineItems[0].unit).toBe("kg");
      expect(String(sale.lineItems[0].quantity)).toBe("0.765");

      const un = buildService(buildPrismaMock(buildProduct(10)));
      await expect(un.service.create("biz-1", "cashier-1", saleDto({ lineItems: [{ productId: "prod-1", quantity: 1.5 }] }))).rejects.toThrow(
        '"Widget" is sold in whole units',
      );
    });

    it("an offline sale keeps whether the till's prices included tax", async () => {
      const prisma = buildPrismaMock(buildProduct(10, 14), { store: { country: "AO", ivaRegime: "GERAL", pricesIncludeTax: true } });
      const { service } = buildService(prisma);
      const sale = (await service.create(
        "biz-1",
        "cashier-1",
        saleDto({
          clientId: "1f0e2d3c-4b5a-4968-8776-655443322119",
          offline: { createdAt: new Date().toISOString(), pricesIncludeTax: false },
          payments: [{ method: PaymentMethod.CASH, amount: 11.4 }],
        }),
      )) as any;
      expect(String(sale.total)).toBe("11.4");
      expect(sale.pricesIncludeTax).toBe(false);
    });
  });

  describe("price changes and manager approvals", () => {
    const changed = { lineItems: [{ productId: "prod-1", quantity: 1, unitPrice: 8 }], payments: [{ method: PaymentMethod.CASH, amount: 8 }] };

    it("needs CHANGE_PRICE or a manager's approval", async () => {
      const { service } = buildService(buildPrismaMock(buildProduct(10)));
      await expect(service.create("biz-1", "cashier-1", saleDto(changed))).rejects.toThrow(ForbiddenException);
    });

    it("uses the approval once, inside the sale, and keeps the original price", async () => {
      const prisma = buildPrismaMock(buildProduct(10));
      const consume = jest.fn().mockResolvedValue({ id: "o1", approvedById: "m1", permission: Permission.CHANGE_PRICE });
      const { service } = buildService(prisma, { overrides: { consume, recordOffline: jest.fn() } });
      const sale = await service.create(
        "biz-1",
        "cashier-1",
        saleDto({ ...changed, overrides: [{ permission: Permission.CHANGE_PRICE, token: "tok" }] }),
      );
      expect(consume).toHaveBeenCalledWith("tok", { userId: "cashier-1", businessId: "biz-1" }, Permission.CHANGE_PRICE, prisma.__tx);
      const line = (sale as any).lineItems[0];
      expect(String(line.unitPrice)).toBe("8");
      expect(String(line.originalUnitPrice)).toBe("10");
    });

    it("lets someone with CHANGE_PRICE do it alone", async () => {
      const { service, overrides } = buildService(buildPrismaMock(buildProduct(10)), { permissions: [Permission.CHANGE_PRICE] });
      await service.create("biz-1", "cashier-1", saleDto(changed));
      expect(overrides.consume).not.toHaveBeenCalled();
    });

    it("needs DISCOUNT_ABOVE_LIMIT for a discount over the maximum", async () => {
      const prisma = buildPrismaMock(buildProduct(10));
      prisma.business.findUnique.mockResolvedValue({ maxDiscountPercent: new Prisma.Decimal(10) });
      const discounted = { discount: { type: "PERCENT", value: 20 }, payments: [{ method: PaymentMethod.CASH, amount: 8 }] };

      const cashier = buildService(prisma, { permissions: [Permission.APPLY_DISCOUNT] });
      await expect(cashier.service.create("biz-1", "cashier-1", saleDto(discounted))).rejects.toThrow("Discounts can't be more than 10% of the price");

      const manager = buildService(prisma, { permissions: [Permission.APPLY_DISCOUNT, Permission.DISCOUNT_ABOVE_LIMIT] });
      await expect(manager.service.create("biz-1", "cashier-1", saleDto(discounted))).resolves.toBeDefined();
    });
  });
});

describe("offlineReceiptNumber", () => {
  it("matches the till's formula (same vector as apps/web sync.test.ts)", () => {
    expect(offlineReceiptNumber("cmstore0000abcd", "3f2a9c1e-7b4d-4e8f-9a01-23456789abcd")).toBe("OFF-ABCD-3F2A9C1E7B4D");
  });
});
