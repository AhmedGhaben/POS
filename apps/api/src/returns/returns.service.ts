import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReturnDto } from "./dto/create-return.dto";

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    return this.prisma.return.findMany({
      where: { storeId },
      include: { lineItems: { include: { product: true } }, sale: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async create(processedById: string, dto: CreateReturnDto) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: dto.saleId },
      include: { lineItems: true, returns: { include: { lineItems: true } } },
    });
    if (!sale || sale.storeId !== dto.storeId) {
      throw new NotFoundException("Sale not found for this store");
    }

    const alreadyReturned = new Map<string, number>();
    for (const ret of sale.returns) {
      for (const li of ret.lineItems) {
        alreadyReturned.set(li.productId, (alreadyReturned.get(li.productId) ?? 0) + li.quantity);
      }
    }

    let totalRefund = new Prisma.Decimal(0);
    const lineItemsData = dto.lineItems.map((li) => {
      const saleLine = sale.lineItems.find((sl) => sl.productId === li.productId);
      if (!saleLine) {
        throw new BadRequestException(`Product ${li.productId} was not part of this sale`);
      }
      const returnedSoFar = alreadyReturned.get(li.productId) ?? 0;
      if (returnedSoFar + li.quantity > saleLine.quantity) {
        throw new BadRequestException(
          `Cannot return more than was sold for one of the products`,
        );
      }

      const taxPerUnit = saleLine.taxAmount.div(saleLine.quantity);
      const unitPrice = saleLine.unitPrice;
      const lineTotal = unitPrice.add(taxPerUnit).mul(li.quantity);
      totalRefund = totalRefund.add(lineTotal);

      return {
        productId: li.productId,
        quantity: li.quantity,
        unitPrice,
        lineTotal,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      for (const li of dto.lineItems) {
        await tx.inventoryItem.upsert({
          where: { storeId_productId: { storeId: dto.storeId, productId: li.productId } },
          create: { storeId: dto.storeId, productId: li.productId, quantity: li.quantity },
          update: { quantity: { increment: li.quantity } },
        });
      }

      return tx.return.create({
        data: {
          saleId: dto.saleId,
          storeId: dto.storeId,
          processedById,
          reason: dto.reason,
          totalRefund,
          lineItems: { create: lineItemsData },
        },
        include: { lineItems: { include: { product: true } } },
      });
    });
  }
}
