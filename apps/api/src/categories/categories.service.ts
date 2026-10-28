import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { peekCategorySku } from "./sku-counter";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** With how many products each has (archived ones included), for the manage screen. */
  findAll(businessId: string) {
    return this.prisma.category.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
  }

  async create(businessId: string, dto: CreateCategoryDto) {
    const name = dto.name.trim();
    await this.assertNameFree(businessId, name);
    if (dto.skuPrefix) await this.assertPrefixFree(businessId, dto.skuPrefix);
    return this.prisma.category.create({ data: { businessId, name, skuPrefix: dto.skuPrefix ?? null } });
  }

  async rename(businessId: string, id: string, dto: CreateCategoryDto) {
    const category = await this.findOwned(businessId, id);
    const name = dto.name.trim();
    if (name.toLowerCase() !== category.name.toLowerCase()) await this.assertNameFree(businessId, name);
    const prefixChanged = dto.skuPrefix !== undefined && dto.skuPrefix !== category.skuPrefix;
    if (prefixChanged && dto.skuPrefix) await this.assertPrefixFree(businessId, dto.skuPrefix, id);
    return this.prisma.$transaction(async (tx) => {
      // A new prefix counts afresh (from the highest SKU already using it).
      if (prefixChanged) await tx.categorySkuCounter.deleteMany({ where: { categoryId: id } });
      return tx.category.update({ where: { id }, data: { name, ...(dto.skuPrefix !== undefined ? { skuPrefix: dto.skuPrefix } : {}) } });
    });
  }

  /** The SKU a new product in the category would get (not taken until it's saved). */
  async nextSku(businessId: string, id: string) {
    await this.findOwned(businessId, id);
    return { sku: await peekCategorySku(this.prisma, businessId, id) };
  }

  /**
   * Deletes a category. Its products move to `reassignTo` (another category)
   * or are left without one, so nothing is lost.
   */
  async remove(businessId: string, id: string, reassignTo: string | null) {
    await this.findOwned(businessId, id);
    if (reassignTo === id) throw new BadRequestException("Choose a different category to move the products to");
    if (reassignTo) await this.findOwned(businessId, reassignTo);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.product.updateMany({ where: { businessId, categoryId: id }, data: { categoryId: reassignTo } });
      await tx.category.delete({ where: { id } });
      return { deleted: id, moved: count, reassignTo };
    });
  }

  private async findOwned(businessId: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, businessId } });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  private async assertPrefixFree(businessId: string, skuPrefix: string, exceptId?: string) {
    const existing = await this.prisma.category.findFirst({ where: { businessId, skuPrefix, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (existing) throw new ConflictException("Another category already uses that SKU prefix");
  }

  /** Names are unique regardless of case ("Bebidas" and "bebidas" are the same). */
  private async assertNameFree(businessId: string, name: string) {
    const existing = await this.prisma.category.findFirst({
      where: { businessId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      throw new ConflictException("Category already exists");
    }
  }
}
