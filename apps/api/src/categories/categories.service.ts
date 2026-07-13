import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.category.findMany({ where: { businessId }, orderBy: { name: "asc" } });
  }

  async create(businessId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { businessId_name: { businessId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException("Category already exists");
    }
    return this.prisma.category.create({ data: { businessId, name: dto.name } });
  }
}
