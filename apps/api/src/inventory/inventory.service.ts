import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AdjustStockDto } from "./dto/adjust-stock.dto";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    // Services and the like have no stock to show.
    return this.prisma.inventoryItem.findMany({
      where: { storeId, product: { trackStock: true } },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    });
  }

  async adjust(storeId: string, productId: string, dto: AdjustStockDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    if (!product.trackStock) {
      throw new BadRequestException("This product doesn't track stock");
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
