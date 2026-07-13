import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOwn(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException("Business not found");
    }
    return business;
  }
}
