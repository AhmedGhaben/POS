import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, PaymentMethod } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

/** How far an offline sale's clock may run ahead of the server's. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Receipt number for a sale rung up offline. The till prints the same value
 * before the server has seen the sale (keep in step with
 * apps/web/src/features/pos/offline-sale.ts), so a later return can find the
 * sale by what's on the paper.
 */
export function offlineReceiptNumber(storeId: string, clientId: string): string {
  const store = storeId.slice(-4).toUpperCase();
  const client = clientId.replace(/-/g, "").slice(0, 12).toUpperCase();
  return `OFF-${store}-${client}`;
}

function isUniqueViolation(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta?.target ?? "").includes(field)
  );
}

function clampToNow(date: Date): Date {
  const now = Date.now();
  if (Number.isNaN(date.getTime()) || date.getTime() > now + MAX_CLOCK_SKEW_MS) {
    return new Date(now);
  }
  return date;
}

const SALE_INCLUDE = {
  lineItems: { include: { product: true } },
  payments: true,
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  findByStore(storeId: string) {
    return this.prisma.sale.findMany({
      where: { storeId },
      include: SALE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async create(businessId: string, cashierId: string, dto: CreateSaleDto) {
    const offline = dto.offline;
    if (offline && !dto.clientId) {
      throw new BadRequestException("Offline sales need a clientId");
    }

    // A retry of a sale the server already has (e.g. the response was lost).
    if (dto.clientId) {
      const existing = await this.findByClientId(dto.storeId, dto.clientId);
      if (existing) return existing;
    }

    const productIds = dto.lineItems.map((li) => li.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, businessId },
    });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException("One or more products were not found");
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    const lineItemsData = dto.lineItems.map((li) => {
      const product = productById.get(li.productId)!;
      // An offline sale records what already happened at the till, so it
      // keeps the price and tax the cashier charged even if they've changed
      // on the server since.
      const unitPrice =
        offline && li.unitPrice !== undefined ? new Prisma.Decimal(li.unitPrice) : product.sellPrice;
      const taxRate =
        offline && li.taxRate !== undefined ? new Prisma.Decimal(li.taxRate) : product.taxRate;
      const lineSubtotal = unitPrice.mul(li.quantity);
      const taxAmount = lineSubtotal.mul(taxRate).div(100);
      const lineTotal = lineSubtotal.add(taxAmount);

      subtotal = subtotal.add(lineSubtotal);
      taxTotal = taxTotal.add(taxAmount);

      return {
        productId: product.id,
        quantity: li.quantity,
        unitPrice,
        taxAmount,
        discountAmount: new Prisma.Decimal(0),
        lineTotal,
      };
    });
    const total = subtotal.add(taxTotal);
    const receiptNumber = offline
      ? offlineReceiptNumber(dto.storeId, dto.clientId!)
      : `${dto.storeId.slice(-4).toUpperCase()}-${Date.now()}`;

    const paymentsTotal = dto.payments.reduce(
      (sum, p) => sum.add(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );
    if (paymentsTotal.sub(total).abs().gt(0.01)) {
      throw new BadRequestException("Payment amounts do not cover the total");
    }

    let amountTendered: Prisma.Decimal | null = null;
    let changeDue: Prisma.Decimal | null = null;
    const paymentsData = dto.payments.map((p) => {
      const amount = new Prisma.Decimal(p.amount);
      if (p.method !== PaymentMethod.CASH) {
        return { method: p.method, amount, tendered: null, change: null };
      }
      const tendered = p.tendered !== undefined ? new Prisma.Decimal(p.tendered) : amount;
      const change = tendered.sub(amount);
      if (change.lt(0)) {
        throw new BadRequestException("Tendered amount is less than the payment amount");
      }
      amountTendered = (amountTendered ?? new Prisma.Decimal(0)).add(tendered);
      changeDue = (changeDue ?? new Prisma.Decimal(0)).add(change);
      return { method: p.method, amount, tendered, change };
    });

    const terminalId = await this.resolveTerminal(businessId, dto.terminalId);
    const createdAt = offline ? clampToNow(new Date(offline.createdAt)) : undefined;

    let sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;
    try {
      sale = await this.prisma.$transaction(async (tx) => {
        if (offline) {
          // The goods already left the shop: record the sale even if the
          // server's stock count says there weren't enough.
          for (const li of dto.lineItems) {
            await tx.inventoryItem.upsert({
              where: { storeId_productId: { storeId: dto.storeId, productId: li.productId } },
              update: { quantity: { decrement: li.quantity } },
              create: { storeId: dto.storeId, productId: li.productId, quantity: -li.quantity },
            });
          }
        } else {
          for (const li of dto.lineItems) {
            const inventoryItem = await tx.inventoryItem.findUnique({
              where: { storeId_productId: { storeId: dto.storeId, productId: li.productId } },
            });
            if (!inventoryItem || inventoryItem.quantity < li.quantity) {
              const product = productById.get(li.productId)!;
              throw new BadRequestException(`Insufficient stock for "${product.name}"`);
            }
          }

          for (const li of dto.lineItems) {
            await tx.inventoryItem.update({
              where: { storeId_productId: { storeId: dto.storeId, productId: li.productId } },
              data: { quantity: { decrement: li.quantity } },
            });
          }
        }

        if (terminalId) {
          await tx.terminal.update({ where: { id: terminalId }, data: { lastSeenAt: new Date() } });
        }

        return tx.sale.create({
          data: {
            storeId: dto.storeId,
            cashierId,
            customerId: dto.customerId,
            receiptNumber,
            subtotal,
            taxTotal,
            discountTotal: new Prisma.Decimal(0),
            total,
            paymentMethod: dto.payments[0].method,
            amountTendered,
            changeDue,
            clientId: dto.clientId,
            createdOffline: !!offline,
            terminalId,
            ...(createdAt ? { createdAt } : {}),
            lineItems: { create: lineItemsData },
            payments: { create: paymentsData },
          },
          include: SALE_INCLUDE,
        });
      });
    } catch (error) {
      // Two copies of the same sale raced and the other one won.
      if (dto.clientId && isUniqueViolation(error, "clientId")) {
        const existing = await this.findByClientId(dto.storeId, dto.clientId);
        if (existing) return existing;
      }
      throw error;
    }

    // Best-effort — a mail failure shouldn't fail an already-completed sale.
    this.emailReceiptIfRequested(dto, sale).catch((error) => {
      this.logger.error(`Failed to email receipt for sale ${sale.id}: ${error}`);
    });

    return sale;
  }

  private findByClientId(storeId: string, clientId: string) {
    return this.prisma.sale.findUnique({
      where: { storeId_clientId: { storeId, clientId } },
      include: SALE_INCLUDE,
    });
  }

  /** A till that's been removed is ignored rather than failing a sale that
   * already happened. */
  private async resolveTerminal(businessId: string, terminalId?: string): Promise<string | null> {
    if (!terminalId) return null;
    const terminal = await this.prisma.terminal.findFirst({
      where: { id: terminalId, businessId },
      select: { id: true },
    });
    if (!terminal) {
      this.logger.warn(`Ignoring unknown terminal ${terminalId} on a sale`);
    }
    return terminal?.id ?? null;
  }

  private async emailReceiptIfRequested(
    dto: CreateSaleDto,
    sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>,
  ): Promise<void> {
    let email = dto.receiptEmail;
    if (!email && dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      email = customer?.email ?? undefined;
    }
    if (!email) {
      return;
    }

    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      include: { business: { select: { currency: true } } },
    });
    await this.mail.sendReceiptEmail(email, {
      storeName: store?.name ?? "Store",
      currency: store?.business.currency ?? "USD",
      receiptNumber: sale.receiptNumber,
      items: sale.lineItems.map((li) => ({
        name: li.product.name,
        quantity: li.quantity,
        unitPrice: li.unitPrice.toString(),
        lineTotal: li.lineTotal.toString(),
      })),
      subtotal: sale.subtotal.toString(),
      taxTotal: sale.taxTotal.toString(),
      total: sale.total.toString(),
    });
  }
}
