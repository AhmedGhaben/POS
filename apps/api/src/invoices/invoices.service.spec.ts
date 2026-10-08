import { NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { formatInvoiceNumber, InvoicesService, yearInTimezone } from "./invoices.service";

const OWNER = { userId: "owner-1", businessId: "biz-1", role: Role.OWNER };
const CASHIER = { userId: "cashier-1", businessId: "biz-1", role: Role.CASHIER };
const SALE = {
  id: "sale-1",
  storeId: "store-1",
  customerId: null,
  store: { id: "store-1", businessId: "biz-1", name: "Main", address: null, phone: null, timezone: "UTC" },
  invoice: null,
};

function buildService(sale: unknown = SALE) {
  const prisma = {
    sale: { findUnique: jest.fn().mockResolvedValue(sale) },
    storeUser: { findUnique: jest.fn().mockResolvedValue(null) },
    business: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "biz-1", name: "Cafe", currency: "EUR", logoUpdatedAt: null }),
    },
    invoice: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    customer: { update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ next: 8 }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return { service: new InvoicesService(prisma as any), prisma };
}

describe("invoice numbering helpers", () => {
  it("formats INV-<year>-<4 digits>", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("INV-2026-0001");
    expect(formatInvoiceNumber(2026, 12345)).toBe("INV-2026-12345");
  });

  it("takes the year in the store's timezone", () => {
    const newYearUtc = new Date("2027-01-01T00:30:00Z");
    expect(yearInTimezone(newYearUtc, "UTC")).toBe(2027);
    expect(yearInTimezone(newYearUtc, "America/New_York")).toBe(2026);
  });
});

describe("InvoicesService.issueForSale", () => {
  it("numbers the invoice from the counter and snapshots the seller", async () => {
    const { service, prisma } = buildService();

    const invoice: any = await service.issueForSale(OWNER, "sale-1", { buyerName: "Acme Ltd", buyerTaxId: "GB1" });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(invoice).toMatchObject({
      sequence: 7,
      number: `INV-${new Date().getUTCFullYear()}-0007`,
      buyerName: "Acme Ltd",
      buyerTaxId: "GB1",
      seller: expect.objectContaining({ name: "Cafe", currency: "EUR", store: expect.objectContaining({ name: "Main" }) }),
    });
  });

  it("returns the existing invoice instead of issuing a second one", async () => {
    const existing = { id: "inv-1", number: "INV-2026-0003" };
    const { service, prisma } = buildService({ ...SALE, invoice: existing });

    await expect(service.issueForSale(OWNER, "sale-1", { buyerName: "Acme" })).resolves.toBe(existing);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("404s for a sale in another business", async () => {
    const { service } = buildService({ ...SALE, store: { ...SALE.store, businessId: "other" } });

    await expect(service.issueForSale(OWNER, "sale-1", { buyerName: "Acme" })).rejects.toThrow(NotFoundException);
  });

  it("404s for a cashier without access to the sale's store", async () => {
    const { service, prisma } = buildService();

    await expect(service.issueForSale(CASHIER, "sale-1", { buyerName: "Acme" })).rejects.toThrow(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("saves buyer details to the sale's customer when asked", async () => {
    const { service, prisma } = buildService({ ...SALE, customerId: "cust-1" });

    await service.issueForSale(OWNER, "sale-1", {
      buyerName: "Acme Ltd",
      buyerAddress: "1 Road",
      buyerTaxId: "GB1",
      saveToCustomer: true,
    });

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: { name: "Acme Ltd", address: "1 Road", taxId: "GB1" },
    });
  });
});
