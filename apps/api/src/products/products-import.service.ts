import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ImportProductsDto } from "./dto/import-products.dto";
import { EXEMPTION_REQUIRED } from "./products.service";
import { recordMovement } from "../stock/stock";
import { activeExemptions, countryConfig } from "../countries";

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
    const config = countryConfig(business.country);
    const exemptions = new Set(config ? activeExemptions(config).map((e) => e.code) : []);
    // A percentage picks the business's rate with that percentage (by name on
    // screen); 0% needs a known exemption reason where the country has them.
    const taxFields = (rate: number | Prisma.Decimal, exemptionCode?: string) => {
      const percentage = new Prisma.Decimal(rate);
      if (percentage.isZero()) {
        const code = exemptionCode?.trim().toUpperCase() || null;
        if (config && (!code || !exemptions.has(code))) return null;
        return { taxRate: percentage, taxRateId: null, taxCode: "ISE", exemptionCode: code };
      }
      const match = taxRates.find((r) => r.percentage.equals(percentage));
      return { taxRate: percentage, taxRateId: match?.id ?? null, taxCode: match?.taxCode ?? "NOR", exemptionCode: null };
    };
    // A new product without a rate in the file: the business's default rate, never exempt.
    const defaultRate = taxRates.find((r) => r.isDefault);
    const defaultTax = defaultRate
      ? { taxRate: defaultRate.percentage, taxRateId: defaultRate.id, taxCode: defaultRate.taxCode, exemptionCode: null }
      : taxFields(config?.taxRates.find((r) => r.isDefault)?.percentage ?? business.defaultTaxRate);

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

          // An exemption reason alone means 0%.
          const rowRate = row.taxRate ?? (row.exemptionCode ? 0 : undefined);
          const tax = rowRate !== undefined ? taxFields(rowRate, row.exemptionCode) : undefined;
          if (tax === null) {
            skip(row.exemptionCode ? "Unknown exemption reason" : EXEMPTION_REQUIRED);
            continue;
          }
          if (!existing && !tax && !defaultTax) {
            skip(EXEMPTION_REQUIRED);
            continue;
          }

          const fields = {
            name: row.name.trim(),
            sellPrice: row.sellPrice,
            ...(barcode ? { barcode } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(row.costPrice !== undefined ? { costPrice: row.costPrice } : {}),
            ...(tax ?? {}),
          };
          const product = existing
            ? // Re-importing a deactivated product brings it back.
              await tx.product.update({ where: { id: existing.id }, data: { ...fields, isActive: true } })
            : await tx.product.create({
                data: {
                  businessId: user.businessId,
                  sku,
                  costPrice: 0,
                  ...defaultTax,
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
