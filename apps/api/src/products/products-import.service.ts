import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ImportProductsDto } from "./dto/import-products.dto";
import { recordMovement } from "../stock/stock";

export interface ImportResult {
  created: number;
  updated: number;
  skipped: { line: number; sku: string; reason: string }[];
}

/**
 * Bulk upsert by (businessId, sku) for the CSV import. The web app validates
 * and previews first; this re-checks, writes valid rows in one transaction,
 * and reports skipped rows instead of failing the whole file.
 */
@Injectable()
export class ProductsImportService {
  constructor(private readonly prisma: PrismaService) {}

  async import(user: AuthenticatedUser, dto: ImportProductsDto): Promise<ImportResult> {
    const wantsStock = dto.rows.some((r) => r.stock !== undefined);
    if (wantsStock) {
      if (!dto.storeId) throw new BadRequestException("Choose a store for the Stock column");
      await this.assertStoreAccess(user, dto.storeId);
    }

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: user.businessId } });
    const skus = [...new Set(dto.rows.map((r) => r.sku.trim()))];
    const barcodes = [...new Set(dto.rows.map((r) => r.barcode?.trim()).filter((b): b is string => !!b))];
    const [existingProducts, categories, taxRates, barcodeOwners] = await Promise.all([
      this.prisma.product.findMany({ where: { businessId: user.businessId, sku: { in: skus } } }),
      this.prisma.category.findMany({ where: { businessId: user.businessId } }),
      this.prisma.taxRate.findMany({ where: { businessId: user.businessId, active: true, taxType: "IVA" }, orderBy: { isDefault: "desc" } }),
      this.prisma.product.findMany({
        where: { businessId: user.businessId, isActive: true, barcode: { in: barcodes } },
        select: { sku: true, name: true, barcode: true },
      }),
    ]);
    const productsBySku = new Map(existingProducts.map((p) => [p.sku, p]));
    const categoryIds = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
    // Who has each barcode: other products, then earlier rows of this file.
    const barcodeOwner = new Map(barcodeOwners.map((p) => [p.barcode!, { sku: p.sku, name: p.name }]));
    // A percentage picks the business's rate with that percentage (by name on screen).
    const taxFields = (rate: number | Prisma.Decimal) => {
      const percentage = new Prisma.Decimal(rate);
      if (percentage.isZero()) return { taxRate: percentage, taxRateId: null, taxCode: "ISE" };
      const match = taxRates.find((r) => r.percentage.equals(percentage));
      return { taxRate: percentage, taxRateId: match?.id ?? null, taxCode: match?.taxCode ?? "NOR" };
    };

    const result: ImportResult = { created: 0, updated: 0, skipped: [] };
    const seen = new Set<string>();

    await this.prisma.$transaction(
      async (tx) => {
        for (const row of dto.rows) {
          const sku = row.sku.trim();
          const skip = (reason: string) => result.skipped.push({ line: row.line, sku, reason });

          if (seen.has(sku)) {
            skip("SKU appears more than once in the file");
            continue;
          }
          seen.add(sku);

          const existing = productsBySku.get(sku);
          if (existing && !dto.updateExisting) {
            skip("SKU already exists (updating existing products is off)");
            continue;
          }

          let categoryId: string | undefined;
          if (row.category) {
            const key = row.category.trim().toLowerCase();
            categoryId = categoryIds.get(key);
            if (!categoryId) {
              if (!dto.createCategories) {
                skip(`Unknown category "${row.category}"`);
                continue;
              }
              const created = await tx.category.create({
                data: { businessId: user.businessId, name: row.category.trim() },
              });
              categoryId = created.id;
              categoryIds.set(key, created.id);
            }
          }

          const barcode = row.barcode?.trim();
          const owner = barcode ? barcodeOwner.get(barcode) : undefined;
          if (owner && owner.sku !== sku) {
            skip(`Barcode already used by "${owner.name}"`);
            continue;
          }
          if (barcode) barcodeOwner.set(barcode, { sku, name: row.name.trim() });

          const fields = {
            name: row.name.trim(),
            sellPrice: row.sellPrice,
            ...(barcode ? { barcode } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(row.costPrice !== undefined ? { costPrice: row.costPrice } : {}),
            ...(row.taxRate !== undefined ? taxFields(row.taxRate) : {}),
          };
          const product = existing
            ? // Re-importing a deactivated product brings it back.
              await tx.product.update({ where: { id: existing.id }, data: { ...fields, isActive: true } })
            : await tx.product.create({
                data: {
                  businessId: user.businessId,
                  sku,
                  costPrice: 0,
                  ...taxFields(business.defaultTaxRate),
                  inventoryType: "M",
                  ...fields,
                },
              });
          if (existing) result.updated++;
          else result.created++;

          // Sets the count: the difference goes in the stock history.
          if (row.stock !== undefined && dto.storeId && product.trackStock) {
            const current = await tx.inventoryItem.findUnique({
              where: { storeId_productId: { storeId: dto.storeId, productId: product.id } },
            });
            const difference = new Prisma.Decimal(row.stock).sub(current?.quantity ?? 0);
            if (!difference.isZero()) {
              await recordMovement(tx, {
                storeId: dto.storeId,
                product,
                type: current ? "ADJUSTMENT" : "OPENING",
                quantity: difference,
                userId: user.userId,
                note: "CSV import",
              });
            }
          }
        }
      },
      // Up to 1,000 rows of sequential writes; the default 5 s is too short.
      { timeout: 60_000 },
    );
    return result;
  }

  private async assertStoreAccess(user: AuthenticatedUser, storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.businessId !== user.businessId) throw new NotFoundException("Store not found");
    if (user.role === Role.OWNER) return;
    const access = await this.prisma.storeUser.findUnique({
      where: { userId_storeId: { userId: user.userId, storeId } },
    });
    if (!access) throw new ForbiddenException("No access to that store");
  }
}
