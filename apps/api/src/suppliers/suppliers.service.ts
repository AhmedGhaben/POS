import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.supplier.findMany({ where: { businessId }, orderBy: { name: "asc" } });
  }

  create(businessId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: { businessId, ...dto } });
  }
}
