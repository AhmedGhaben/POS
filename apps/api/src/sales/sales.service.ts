import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSaleDto } from "./dto/create-sale.dto";

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    return this.prisma.sale.findMany({
      where: { storeId },
      include: { lineItems: { include: { product: true } } },
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

    return this.prisma.$transaction(async (tx) => {
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
          paymentMethod: dto.paymentMethod,
          lineItems: { create: lineItemsData },
        },
        include: { lineItems: { include: { product: true } } },
      });
    });
  }
}
