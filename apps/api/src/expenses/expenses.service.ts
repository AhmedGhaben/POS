import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    return this.prisma.expense.findMany({
      where: { storeId },
      orderBy: { incurredAt: "desc" },
      take: 100,
    });
  }

  create(createdById: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        storeId: dto.storeId,
        createdById,
        category: dto.category,
        description: dto.description,
        amount: dto.amount,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : undefined,
      },
    });
  }
}
