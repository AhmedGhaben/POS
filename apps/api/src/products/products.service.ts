import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

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
      where: { businessId, barcode, isActive: true },
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
    return this.prisma.product.create({
      data: {
        businessId,
        categoryId: dto.categoryId,
        sku: dto.sku,
        barcode: dto.barcode?.trim() || null,
        name: dto.name,
        description: dto.description,
        costPrice: dto.costPrice,
        sellPrice: dto.sellPrice,
        taxRate: dto.taxRate ?? 0,
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

    const data: Prisma.ProductUncheckedUpdateInput = {
      categoryId: dto.categoryId,
      sku: dto.sku,
      barcode: dto.barcode === undefined ? undefined : dto.barcode?.trim() || null,
      name: dto.name,
      description: dto.description,
      costPrice: canEditCostPrice ? dto.costPrice : undefined,
      sellPrice: dto.sellPrice,
      taxRate: dto.taxRate,
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

  private async assertCategory(businessId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, businessId } });
    if (!category) throw new NotFoundException("Category not found");
  }
}
