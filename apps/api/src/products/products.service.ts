import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string, search?: string) {
    return this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
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
    return this.prisma.product.create({
      data: {
        businessId,
        categoryId: dto.categoryId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        description: dto.description,
        costPrice: dto.costPrice,
        sellPrice: dto.sellPrice,
        taxRate: dto.taxRate ?? 0,
      },
    });
  }

  async update(businessId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.businessId !== businessId) {
      throw new NotFoundException("Product not found");
    }
    return this.prisma.product.update({ where: { id: productId }, data: dto });
  }
}
