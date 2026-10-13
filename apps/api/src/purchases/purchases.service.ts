import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";
import { recordMovement } from "../stock/stock";
import { unitDecimals } from "../sales/pricing";

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    return this.prisma.purchase.findMany({
      where: { storeId },
      include: { lineItems: { include: { product: true } }, supplier: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async create(businessId: string, createdById: string, dto: CreatePurchaseDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || supplier.businessId !== businessId) {
      throw new NotFoundException("Supplier not found");
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
    const lineItemsData = dto.lineItems.map((li) => {
      const product = productById.get(li.productId)!;
      if (unitDecimals(product.unit) === 0 && !Number.isInteger(li.quantity)) {
        throw new BadRequestException(`"${product.name}" is sold in whole units`);
      }
      const lineTotal = new Prisma.Decimal(li.unitCost).mul(li.quantity).toDecimalPlaces(2);
      subtotal = subtotal.add(lineTotal);
      return {
        productId: li.productId,
        quantity: li.quantity,
        unitCost: li.unitCost,
        lineTotal,
      };
    });
    const purchaseNumber = `PO-${dto.storeId.slice(-4).toUpperCase()}-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          storeId: dto.storeId,
          supplierId: dto.supplierId,
          createdById,
          purchaseNumber,
          subtotal,
          taxTotal: new Prisma.Decimal(0),
          total: subtotal,
          status: "RECEIVED",
          lineItems: { create: lineItemsData },
        },
        include: { lineItems: { include: { product: true } }, supplier: true },
      });
      // Bought services (and other untracked items) don't add stock. What
      // was paid re-averages the store's cost.
      for (const li of dto.lineItems) {
        const product = productById.get(li.productId)!;
        if (!product.trackStock) continue;
        await recordMovement(tx, {
          storeId: dto.storeId,
          product,
          type: "PURCHASE",
          quantity: li.quantity,
          unitCost: li.unitCost,
          purchaseId: purchase.id,
          userId: createdById,
        });
      }
      return purchase;
    });
  }
}
