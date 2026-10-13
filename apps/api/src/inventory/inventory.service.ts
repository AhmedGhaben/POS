import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { unitDecimals } from "../sales/pricing";
import { recordMovement } from "../stock/stock";
import { AdjustStockDto } from "./dto/adjust-stock.dto";

export interface StockAtDateRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  productType: string;
  inventoryType: string | null;
  quantity: string;
  averageCost: string;
  value: string;
}

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

  /**
   * Sets the stock to what was counted. The difference is an adjustment in
   * the stock history: found stock comes in at the average cost, missing
   * stock leaves at it.
   */
  async adjust(storeId: string, productId: string, dto: AdjustStockDto, userId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    if (!product.trackStock) {
      throw new BadRequestException("This product doesn't track stock");
    }
    if (unitDecimals(product.unit) === 0 && !Number.isInteger(dto.quantity)) {
      throw new BadRequestException(`"${product.name}" is sold in whole units`);
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.inventoryItem.findUnique({ where: { storeId_productId: { storeId, productId } } });
      const difference = new Prisma.Decimal(dto.quantity).sub(current?.quantity ?? 0);
      if (!difference.isZero()) {
        await recordMovement(tx, { storeId, product, type: "ADJUSTMENT", quantity: difference, userId, note: dto.note?.trim() || undefined });
      }
      return tx.inventoryItem.upsert({
        where: { storeId_productId: { storeId, productId } },
        create: { storeId, productId, quantity: dto.quantity, reorderLevel: dto.reorderLevel ?? 0, averageCost: product.costPrice },
        update: dto.reorderLevel !== undefined ? { reorderLevel: dto.reorderLevel } : {},
        include: { product: true },
      });
    });
  }

  /** A product's stock history in a store, newest first. */
  history(storeId: string, productId: string) {
    return this.prisma.stockMovement.findMany({
      where: { storeId, productId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 200,
    });
  }

  /**
   * The stock and its book value at the end of a day (for the yearly
   * inventory at 31 December): each product's movements up to then, valued
   * at the average cost after its last movement. History starts when stock
   * movements were introduced; earlier stock is the opening movement.
   */
  async stockAt(storeId: string, date: string): Promise<StockAtDateRow[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      throw new BadRequestException("Give the date as YYYY-MM-DD");
    }
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } });
    const timezone = store?.timezone || "UTC";
    // The end of that day where the store is.
    const rows = await this.prisma.$queryRaw<
      { productId: string; sku: string; name: string; unit: string; productType: string; inventoryType: string | null; quantity: Prisma.Decimal; averageCost: Prisma.Decimal }[]
    >`
      WITH upto AS (
        SELECT m.* FROM stock_movements m
        WHERE m."storeId" = ${storeId}
          AND m."occurredAt" < ((${date}::date + 1)::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'
      ),
      totals AS (SELECT "productId", SUM(quantity) AS quantity FROM upto GROUP BY "productId"),
      last AS (
        SELECT DISTINCT ON ("productId") "productId", "averageCost" FROM upto
        ORDER BY "productId", "occurredAt" DESC, id DESC
      )
      SELECT p.id AS "productId", p.sku, p.name, p.unit, p."productType"::text AS "productType", p."inventoryType",
             t.quantity, l."averageCost"
      FROM totals t JOIN last l USING ("productId") JOIN products p ON p.id = t."productId"
      WHERE t.quantity <> 0
      ORDER BY p.name`;
    return rows.map((r) => ({
      ...r,
      quantity: r.quantity.toString(),
      averageCost: r.averageCost.toString(),
      value: r.quantity.mul(r.averageCost).toDecimalPlaces(2).toFixed(2),
    }));
  }
}
