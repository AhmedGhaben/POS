import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ImportProductsDto } from "./dto/import-products.dto";

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
    const [existingProducts, categories] = await Promise.all([
      this.prisma.product.findMany({ where: { businessId: user.businessId, sku: { in: skus } } }),
      this.prisma.category.findMany({ where: { businessId: user.businessId } }),
    ]);
    const productsBySku = new Map(existingProducts.map((p) => [p.sku, p]));
    const categoryIds = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

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

          const fields = {
            name: row.name.trim(),
            sellPrice: row.sellPrice,
            ...(row.barcode ? { barcode: row.barcode.trim() } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(row.costPrice !== undefined ? { costPrice: row.costPrice } : {}),
            ...(row.taxRate !== undefined ? { taxRate: row.taxRate } : {}),
          };
          const product = existing
            ? // Re-importing a deactivated product brings it back.
              await tx.product.update({ where: { id: existing.id }, data: { ...fields, isActive: true } })
            : await tx.product.create({
                data: {
                  businessId: user.businessId,
                  sku,
                  costPrice: 0,
                  taxRate: business.defaultTaxRate,
                  ...fields,
                },
              });
          if (existing) result.updated++;
          else result.created++;

          if (row.stock !== undefined && dto.storeId) {
            await tx.inventoryItem.upsert({
              where: { storeId_productId: { storeId: dto.storeId, productId: product.id } },
              create: { storeId: dto.storeId, productId: product.id, quantity: row.stock },
              update: { quantity: row.stock },
            });
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
