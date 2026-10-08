import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, PaymentMethod } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

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
      const unitPrice = product.sellPrice;
      const lineSubtotal = unitPrice.mul(li.quantity);
      const taxAmount = lineSubtotal.mul(product.taxRate).div(100);
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
    const receiptNumber = `${dto.storeId.slice(-4).toUpperCase()}-${Date.now()}`;

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

    const sale = await this.prisma.$transaction(async (tx) => {
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
          lineItems: { create: lineItemsData },
          payments: { create: paymentsData },
        },
        include: SALE_INCLUDE,
      });
    });

    // Best-effort — a mail failure shouldn't fail an already-completed sale.
    this.emailReceiptIfRequested(dto, sale).catch((error) => {
      this.logger.error(`Failed to email receipt for sale ${sale.id}: ${error}`);
    });

    return sale;
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
