import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SaleStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string, search?: string) {
    return this.prisma.customer.findMany({
      where: {
        businessId,
        // "Consumidor Final" is what a sale gets when nobody is chosen.
        isFinalConsumer: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { taxId: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  /** Details, completed purchases (count, total, last date) and the last 5 sales. */
  async card(businessId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new NotFoundException("Customer not found");
    const completed = { customerId: id, status: SaleStatus.COMPLETED };
    const [totals, recent] = await Promise.all([
      this.prisma.sale.aggregate({ where: completed, _count: true, _sum: { total: true }, _max: { createdAt: true } }),
      this.prisma.sale.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, receiptNumber: true, createdAt: true, total: true, status: true },
      }),
    ]);
    return {
      customer,
      purchases: {
        count: totals._count,
        total: (totals._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
        lastAt: totals._max.createdAt,
      },
      recent: recent.map((s) => ({ ...s, total: s.total.toFixed(2) })),
    };
  }

  create(businessId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        businessId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        taxId: dto.taxId,
      },
    });
  }
}
