import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, ShiftStatus } from "@prisma/client";
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
    if (sale.status === "VOIDED") {
      throw new BadRequestException("This sale was cancelled");
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

      // What the customer actually paid per item: after discounts, with tax.
      const unitPrice = saleLine.unitPrice;
      const lineTotal = saleLine.lineTotal.div(saleLine.quantity).mul(li.quantity).toDecimalPlaces(2);
      totalRefund = totalRefund.add(lineTotal);

      return {
        productId: li.productId,
        quantity: li.quantity,
        unitPrice,
        lineTotal,
      };
    });

    // Cash back leaves a drawer, so it happens in that till's open shift. A
    // credit note with no cash (refund by transfer, card, to the customer's
    // balance) can be done from the back office, linked to the person and store.
    const refundMethod = dto.refundMethod ?? PaymentMethod.CASH;
    const shift = dto.shiftClientId
      ? await this.prisma.shift.findUnique({
          where: { storeId_clientId: { storeId: dto.storeId, clientId: dto.shiftClientId } },
          select: { id: true, status: true },
        })
      : null;
    if (refundMethod === PaymentMethod.CASH && shift?.status !== ShiftStatus.OPEN) {
      throw new BadRequestException("A cash refund has to be done at a till with an open shift");
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.lineItems.map((li) => li.productId) } },
      select: { id: true, trackStock: true },
    });
    const tracked = new Set(products.filter((p) => p.trackStock).map((p) => p.id));

    return this.prisma.$transaction(async (tx) => {
      for (const li of dto.lineItems.filter((l) => tracked.has(l.productId))) {
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
          refundMethod,
          shiftId: shift?.status === ShiftStatus.OPEN ? shift.id : null,
          lineItems: { create: lineItemsData },
        },
        include: { lineItems: { include: { product: true } } },
      });
    });
  }
}
