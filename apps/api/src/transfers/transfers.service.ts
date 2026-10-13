import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { recordMovement } from "../stock/stock";
import { unitDecimals } from "../sales/pricing";

const TRANSFER_INCLUDE = {
  lineItems: { include: { product: true } },
  fromStore: { select: { id: true, name: true } },
  toStore: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    return this.prisma.stockTransfer.findMany({
      where: { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] },
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async create(businessId: string, transferredById: string, dto: CreateTransferDto) {
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException("Source and destination stores must be different");
    }

    const stores = await this.prisma.store.findMany({
      where: { id: { in: [dto.fromStoreId, dto.toStoreId] }, businessId },
    });
    if (stores.length !== 2) {
      throw new NotFoundException("One or both stores were not found");
    }

    const productIds = dto.lineItems.map((li) => li.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, businessId },
    });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException("One or more products were not found");
    }
    const productById = new Map(products.map((p) => [p.id, p]));
    const untracked = products.find((p) => !p.trackStock);
    if (untracked) {
      throw new BadRequestException(`"${untracked.name}" doesn't track stock, so it can't be transferred`);
    }

    for (const li of dto.lineItems) {
      const product = productById.get(li.productId)!;
      if (unitDecimals(product.unit) === 0 && !Number.isInteger(li.quantity)) {
        throw new BadRequestException(`"${product.name}" is sold in whole units`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          businessId,
          fromStoreId: dto.fromStoreId,
          toStoreId: dto.toStoreId,
          transferredById,
          note: dto.note,
          lineItems: {
            create: dto.lineItems.map((li) => ({ productId: li.productId, quantity: li.quantity })),
          },
        },
        include: TRANSFER_INCLUDE,
      });
      // Leaves at the sending store's average cost and arrives at that cost.
      for (const li of dto.lineItems) {
        const product = productById.get(li.productId)!;
        const out = await recordMovement(tx, {
          storeId: dto.fromStoreId,
          product,
          type: "TRANSFER_OUT",
          quantity: -li.quantity,
          requireStock: true,
          insufficientMessage: `Insufficient stock for "${product.name}" at the source store`,
          transferId: transfer.id,
          userId: transferredById,
        });
        await recordMovement(tx, {
          storeId: dto.toStoreId,
          product,
          type: "TRANSFER_IN",
          quantity: li.quantity,
          unitCost: out.unitCost,
          transferId: transfer.id,
          userId: transferredById,
        });
      }
      return transfer;
    });
  }
}
