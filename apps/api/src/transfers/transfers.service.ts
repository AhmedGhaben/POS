import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTransferDto } from "./dto/create-transfer.dto";

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

    return this.prisma.$transaction(async (tx) => {
      for (const li of dto.lineItems) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { storeId_productId: { storeId: dto.fromStoreId, productId: li.productId } },
        });
        if (!inventoryItem || inventoryItem.quantity < li.quantity) {
          const product = productById.get(li.productId)!;
          throw new BadRequestException(
            `Insufficient stock for "${product.name}" at the source store`,
          );
        }
      }

      for (const li of dto.lineItems) {
        await tx.inventoryItem.update({
          where: { storeId_productId: { storeId: dto.fromStoreId, productId: li.productId } },
          data: { quantity: { decrement: li.quantity } },
        });
        await tx.inventoryItem.upsert({
          where: { storeId_productId: { storeId: dto.toStoreId, productId: li.productId } },
          create: { storeId: dto.toStoreId, productId: li.productId, quantity: li.quantity },
          update: { quantity: { increment: li.quantity } },
        });
      }

      return tx.stockTransfer.create({
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
    });
  }
}
