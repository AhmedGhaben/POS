import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string, search?: string) {
    return this.prisma.customer.findMany({
      where: {
        businessId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  create(businessId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: { businessId, name: dto.name, phone: dto.phone, email: dto.email },
    });
  }
}
