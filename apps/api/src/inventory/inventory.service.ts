import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { unitDecimals } from "../sales/pricing";
import { recordMovement } from "../stock/stock";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { CreateStockCountDto, ParseStockCountDto } from "./dto/stock-count.dto";
import { readTable } from "../accounting/bank-import";
import { previewCountRows } from "./count-import";

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

  async previewCount(storeId: string, dto: ParseStockCountDto) {
    if (!/\.(csv|xlsx)$/i.test(dto.fileName)) throw new BadRequestException("Use a CSV or Excel (.xlsx) stock count file");
    const match = /^data:[^,]*;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dto.dataUrl);
    if (!match || dto.dataUrl.length > 7 * 1024 * 1024) throw new BadRequestException("Stock count files are 5 MB at most");
    const data = Buffer.from(match[1], "base64");
    if (data.length > 5 * 1024 * 1024) throw new BadRequestException("Stock count files are 5 MB at most");
    let table: string[][];
    try { table = readTable(dto.fileName, data, true); }
    catch { throw new BadRequestException("The stock count file cannot be read"); }
    if (table.length < 2 || table.length > 5001) throw new BadRequestException("A stock count needs 1 to 5000 product rows");
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException("Store not found");
    const products = await this.prisma.product.findMany({
      where: { businessId: store.businessId },
      select: { id: true, sku: true, barcode: true, name: true, unit: true, trackStock: true, isActive: true,
        inventoryItems: { where: { storeId }, select: { quantity: true } } },
    });
    try {
      return { rows: previewCountRows(table, products.map((p) => ({ ...p, quantity: p.inventoryItems[0]?.quantity.toString() ?? "0" }))) };
    } catch { throw new BadRequestException("Use SKU or Barcode and Counted quantity column headings"); }
  }

  /** Lock before reading each balance; deterministic ordering prevents count/count deadlocks. */
  async createCount(storeId: string, dto: CreateStockCountDto, userId: string) {
    if (new Set(dto.lines.map((l) => l.productId)).size !== dto.lines.length) throw new BadRequestException("A product can only appear once in a stock count");
    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { id: storeId } });
      if (!store) throw new NotFoundException("Store not found");
      const count = await tx.stockCount.create({ data: { businessId: store.businessId, storeId, userId, note: dto.note?.trim() || null } });
      let changed = 0;
      for (const line of [...dto.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const product = await tx.product.findFirst({ where: { id: line.productId, businessId: store.businessId, isActive: true, trackStock: true } });
        if (!product) throw new BadRequestException("Every counted product must be an active stock product in this business");
        if (unitDecimals(product.unit) === 0 && !Number.isInteger(line.quantity)) throw new BadRequestException("Count whole units for products sold in whole units");
        const item = await tx.inventoryItem.upsert({
          where: { storeId_productId: { storeId, productId: product.id } },
          create: { storeId, productId: product.id, quantity: 0, averageCost: product.costPrice },
          update: { quantity: { increment: 0 } },
        });
        if (line.expectedQuantity != null && !item.quantity.equals(line.expectedQuantity)) throw new ConflictException("Stock changed since the count was prepared. Refresh and review the count again.");
        const difference = new Prisma.Decimal(line.quantity).sub(item.quantity);
        if (!difference.isZero()) {
          await recordMovement(tx, { storeId, product, type: "ADJUSTMENT", quantity: difference, userId, stockCountId: count.id, note: count.note ?? undefined });
          changed++;
        }
      }
      await tx.auditLog.create({ data: { businessId: store.businessId, userId, action: "inventory.count", entityType: "StockCount", entityId: count.id, metadata: { storeId, products: dto.lines.length, changed } } });
      return { id: count.id, changed };
    }, { timeout: 60_000 });
  }

  /**
   * The store's stock: its inventory rows, plus every active product that
   * has no row there yet (a new product, or one never bought for this store)
   * at 0, so its stock can be set. Saving it creates the row (see adjust).
   */
  async findByStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { businessId: true } });
    if (!store) {
      throw new NotFoundException("Store not found");
    }
    // Services and the like have no stock to show.
    const [items, missing] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { storeId, product: { trackStock: true } },
        include: { product: true },
      }),
      this.prisma.product.findMany({
        where: { businessId: store.businessId, trackStock: true, isActive: true, inventoryItems: { none: { storeId } } },
      }),
    ]);
    const zero = new Prisma.Decimal(0);
    const placeholders = missing.map((product) => ({
      // No row yet: an id that can't clash with a real one.
      id: `new:${product.id}`,
      storeId,
      productId: product.id,
      quantity: zero,
      reorderLevel: zero,
      averageCost: product.costPrice,
      updatedAt: product.updatedAt,
      product,
    }));
    return [...items, ...placeholders].sort((a, b) => a.product.name.localeCompare(b.product.name));
  }

  /** Quantity on hand of every active stock product in the store (0 without a row). */
  async levels(storeId: string): Promise<{ productId: string; quantity: string }[]> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { businessId: true } });
    if (!store) throw new NotFoundException("Store not found");
    const products = await this.prisma.product.findMany({
      where: { businessId: store.businessId, trackStock: true, isActive: true },
      select: { id: true, inventoryItems: { where: { storeId }, select: { quantity: true } } },
    });
    return products.map((p) => ({ productId: p.id, quantity: (p.inventoryItems[0]?.quantity ?? new Prisma.Decimal(0)).toString() }));
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
