import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { activeExemptions, countryConfig } from "../countries";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

/** Photos are resized in the browser; this is the most we keep. */
const MAX_PHOTO_BYTES = 512 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

type TaxFields = Pick<Prisma.ProductUncheckedCreateInput, "taxRate" | "taxRateId" | "taxCode" | "exemptionCode">;

/** SAF-T and AGT need the M-code on every exempt line, so an exempt product needs one. */
export const EXEMPTION_REQUIRED = "A product exempt from IVA (0%) needs an exemption reason (M-code)";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active products by default; `archived` lists only archived ones. */
  findAll(businessId: string, search?: string, categoryId?: string, archived = false) {
    return this.prisma.product.findMany({
      where: {
        businessId,
        isActive: !archived,
        ...(categoryId ? { categoryId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { category: true },
      orderBy: { name: "asc" },
    });
  }

  async findByBarcode(businessId: string, barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: { businessId, barcode: barcode.trim(), isActive: true },
    });
    if (!product) {
      throw new NotFoundException("No product with that barcode");
    }
    return product;
  }

  async create(businessId: string, dto: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { businessId_sku: { businessId, sku: dto.sku } },
    });
    if (existing) {
      throw new ConflictException("SKU already exists");
    }
    if (dto.categoryId) await this.assertCategory(businessId, dto.categoryId);
    const barcode = dto.barcode?.trim() || null;
    await this.assertBarcodeFree(businessId, barcode);
    const config = await this.country(businessId);
    this.assertInventoryType(config, dto.inventoryType);
    const tax = (await this.resolveTax(businessId, config, dto)) ?? (await this.defaultTax(businessId, config));
    const trackStock = dto.trackStock ?? true;
    return this.prisma.product.create({
      data: {
        businessId,
        categoryId: dto.categoryId,
        sku: dto.sku,
        barcode,
        name: dto.name,
        description: dto.description,
        costPrice: dto.costPrice,
        sellPrice: dto.sellPrice,
        ...tax,
        unit: dto.unit ?? "un",
        productType: dto.productType ?? (trackStock ? "P" : "S"),
        inventoryType: dto.inventoryType !== undefined ? dto.inventoryType || null : trackStock ? "M" : null,
        trackStock,
      },
    });
  }

  /**
   * Edits a product. Past sales keep the price they were charged at (line
   * items store their own unit price and tax), so a new price only affects
   * sales from now on; a new name shows everywhere, past sales included.
   * Callers who can't see cost
   * prices can't change them either: `canEditCostPrice` false ignores it.
   */
  async update(businessId: string, productId: string, dto: UpdateProductDto, canEditCostPrice = true) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.businessId !== businessId) {
      throw new NotFoundException("Product not found");
    }
    if (dto.sku !== undefined && dto.sku !== product.sku) {
      const clash = await this.prisma.product.findUnique({
        where: { businessId_sku: { businessId, sku: dto.sku } },
      });
      if (clash) throw new ConflictException("SKU already exists");
    }
    if (dto.categoryId) await this.assertCategory(businessId, dto.categoryId);
    const barcode = dto.barcode === undefined ? undefined : dto.barcode?.trim() || null;
    if (barcode && barcode !== product.barcode) await this.assertBarcodeFree(businessId, barcode, productId);
    // Restoring an archived product whose barcode another product took since.
    if (dto.isActive === true && !product.isActive && product.barcode && barcode === undefined) {
      await this.assertBarcodeFree(businessId, product.barcode, productId);
    }
    const config = await this.country(businessId);
    this.assertInventoryType(config, dto.inventoryType);
    const tax = await this.resolveTax(businessId, config, dto);

    const data: Prisma.ProductUncheckedUpdateInput = {
      categoryId: dto.categoryId,
      sku: dto.sku,
      barcode,
      name: dto.name,
      description: dto.description,
      costPrice: canEditCostPrice ? dto.costPrice : undefined,
      sellPrice: dto.sellPrice,
      ...(tax ?? {}),
      unit: dto.unit,
      productType: dto.productType,
      inventoryType: dto.inventoryType === undefined ? undefined : dto.inventoryType || null,
      trackStock: dto.trackStock,
      isActive: dto.isActive,
    };
    try {
      return await this.prisma.product.update({ where: { id: productId }, data });
    } catch (err) {
      // Two edits racing for the same SKU.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("SKU already exists");
      }
      throw err;
    }
  }

  /** Stores a photo sent as a data URL; each upload gets a new random id (its URL). */
  async setPhoto(businessId: string, productId: string, dataUrl: string) {
    await this.findOwned(businessId, productId);
    const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m || !PHOTO_TYPES.includes(m[1])) throw new BadRequestException("Send the photo as a JPEG, PNG or WebP image");
    const data = Buffer.from(m[2], "base64");
    if (data.length > MAX_PHOTO_BYTES) throw new BadRequestException("The photo is too big (512 KB at most)");
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      await tx.productPhoto.deleteMany({ where: { productId } });
      await tx.productPhoto.create({ data: { id, productId, mimeType: m[1], data } });
      return tx.product.update({ where: { id: productId }, data: { photoId: id } });
    });
  }

  /**
   * Deletes a product for good, only when nothing refers to it: no sale,
   * return, purchase or transfer lines, no stock movements and no fiscal
   * document lines (FiscalDocumentLine.productId has no foreign key, so it's
   * checked here). Anything with history is archived instead (isActive).
   */
  async remove(businessId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId }, select: { id: true } });
    if (!product) throw new NotFoundException("Product not found");
    const [counts, documentLines] = await Promise.all([
      this.prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { _count: { select: { saleLineItems: true, returnLineItems: true, purchaseLineItems: true, transferLineItems: true, stockMovements: true } } },
      }),
      this.prisma.fiscalDocumentLine.count({ where: { productId } }),
    ]);
    if (Object.values(counts._count).some((n) => n > 0) || documentLines > 0) {
      throw new ConflictException("This product has sales, purchases or stock history. Archive it instead.");
    }
    await this.prisma.$transaction([
      this.prisma.inventoryItem.deleteMany({ where: { productId } }),
      this.prisma.productPhoto.deleteMany({ where: { productId } }),
      this.prisma.product.delete({ where: { id: productId } }),
    ]);
  }

  async removePhoto(businessId: string, productId: string) {
    await this.findOwned(businessId, productId);
    return this.prisma.$transaction(async (tx) => {
      await tx.productPhoto.deleteMany({ where: { productId } });
      return tx.product.update({ where: { id: productId }, data: { photoId: null } });
    });
  }

  photo(id: string) {
    return this.prisma.productPhoto.findUnique({ where: { id }, select: { mimeType: true, data: true } });
  }

  private async findOwned(businessId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  private async country(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, select: { country: true } });
    return countryConfig(business?.country);
  }

  /**
   * The tax fields for a product from what was sent, or null when the tax
   * wasn't part of the change.
   */
  private async resolveTax(
    businessId: string,
    config: ReturnType<typeof countryConfig>,
    dto: Pick<CreateProductDto, "taxRateId" | "exemptionCode" | "taxRate">,
  ): Promise<TaxFields | null> {
    if (dto.taxRateId) {
      const rate = await this.prisma.taxRate.findFirst({ where: { id: dto.taxRateId, businessId } });
      if (!rate) throw new NotFoundException("Tax rate not found");
      if (!rate.active) throw new BadRequestException("That tax rate is turned off");
      return { taxRateId: rate.id, taxRate: rate.percentage, taxCode: rate.taxCode, exemptionCode: null };
    }
    if (dto.exemptionCode) {
      if (config && !activeExemptions(config).some((e) => e.code === dto.exemptionCode)) {
        throw new BadRequestException("Unknown exemption reason");
      }
      return { taxRateId: null, taxRate: 0, taxCode: "ISE", exemptionCode: dto.exemptionCode };
    }
    // Exempt without a reason: a 0% rate, or no rate and no reason.
    if (dto.taxRate === 0 || (dto.taxRateId === null && dto.exemptionCode === null && dto.taxRate === undefined)) {
      if (config) throw new BadRequestException(EXEMPTION_REQUIRED);
      return { taxRateId: null, taxRate: 0, taxCode: "ISE", exemptionCode: null };
    }
    if (dto.taxRate !== undefined) {
      const match = await this.prisma.taxRate.findFirst({
        where: { businessId, active: true, taxType: "IVA", percentage: new Prisma.Decimal(dto.taxRate) },
        orderBy: { isDefault: "desc" },
      });
      return { taxRateId: match?.id ?? null, taxRate: dto.taxRate, taxCode: match?.taxCode ?? "NOR", exemptionCode: null };
    }
    return null;
  }

  /**
   * A new product's tax when none was chosen: the business's default rate
   * (Taxa geral 14% in Angola), never exempt. Its rates may not exist yet
   * (they're created when first listed): then the country's default.
   */
  private async defaultTax(businessId: string, config: ReturnType<typeof countryConfig>): Promise<TaxFields> {
    const rate = await this.prisma.taxRate.findFirst({ where: { businessId, active: true, isDefault: true, taxType: "IVA" } });
    if (rate) return { taxRateId: rate.id, taxRate: rate.percentage, taxCode: rate.taxCode, exemptionCode: null };
    const fallback = config?.taxRates.find((r) => r.isDefault && r.taxType === "IVA");
    if (fallback) return { taxRateId: null, taxRate: fallback.percentage, taxCode: fallback.taxCode, exemptionCode: null };
    // No country rules: the business's own default, as before.
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, select: { defaultTaxRate: true } });
    const percentage = business?.defaultTaxRate ?? new Prisma.Decimal(0);
    return { taxRateId: null, taxRate: percentage, taxCode: percentage.gt(0) ? "NOR" : "ISE", exemptionCode: null };
  }

  /** A barcode belongs to one active product, so a scan finds one thing. */
  private async assertBarcodeFree(businessId: string, barcode: string | null, exceptId?: string) {
    if (!barcode) return;
    const clash = await this.prisma.product.findFirst({
      where: { businessId, barcode, isActive: true, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { name: true },
    });
    if (clash) throw new ConflictException(`This barcode is already used by "${clash.name}"`);
  }

  private assertInventoryType(config: ReturnType<typeof countryConfig>, inventoryType: string | null | undefined) {
    if (!inventoryType || !config) return;
    if (!config.inventoryTypes.some((t) => t.code === inventoryType)) throw new BadRequestException("Unknown inventory type");
  }

  private async assertCategory(businessId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, businessId } });
    if (!category) throw new NotFoundException("Category not found");
  }
}
