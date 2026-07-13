import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AdjustStockDto } from "./dto/adjust-stock.dto";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { storeId },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    });
  }

  async adjust(storeId: string, productId: string, dto: AdjustStockDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return this.prisma.inventoryItem.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: {
        storeId,
        productId,
        quantity: dto.quantity,
        reorderLevel: dto.reorderLevel ?? 0,
      },
      update: {
        quantity: dto.quantity,
        ...(dto.reorderLevel !== undefined ? { reorderLevel: dto.reorderLevel } : {}),
      },
    });
  }
}
