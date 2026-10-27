import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateExpenseDto, UpdateExpenseDto } from "./dto/create-expense.dto";

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The store's latest expenses, cancelled ones only when asked. Each says
   * whether it was posted to accounting: only an unposted one can be edited.
   */
  async findByStore(storeId: string, includeCancelled = false) {
    const expenses = await this.prisma.expense.findMany({
      where: { storeId, ...(includeCancelled ? {} : { cancelledAt: null }) },
      orderBy: { incurredAt: "desc" },
      take: 100,
    });
    const posted = await this.postedIds(expenses.map((e) => e.id));
    return expenses.map((e) => ({ ...e, posted: posted.has(e.id) }));
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

  /** Corrects an expense not yet posted to accounting; a posted one is cancelled and logged again. */
  async update(user: AuthenticatedUser, id: string, dto: UpdateExpenseDto) {
    const expense = await this.find(user, id);
    if (expense.cancelledAt) throw new BadRequestException("This expense was cancelled");
    if ((await this.postedIds([id])).size > 0) {
      throw new BadRequestException("This expense is already in the accounts. Cancel it and log it again.");
    }
    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        category: dto.category,
        description: dto.description,
        amount: dto.amount,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : undefined,
      },
    });
    return { ...updated, posted: false };
  }

  /**
   * Cancels an expense logged by mistake, recording who, when and why. One
   * already posted to accounting is reversed (estorno) by the next
   * accounting run, as for a cancelled supplier payment.
   */
  async cancel(user: AuthenticatedUser, id: string, reason: string) {
    const expense = await this.find(user, id);
    if (expense.cancelledAt) throw new BadRequestException("This expense was already cancelled");
    const cancelled = await this.prisma.expense.update({
      where: { id },
      data: { cancelledAt: new Date(), cancelledById: user.userId, cancelReason: reason.trim() },
    });
    return { ...cancelled, posted: (await this.postedIds([id])).size > 0 };
  }

  /** An expense of a store the user may work in. */
  private async find(user: AuthenticatedUser, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, store: { businessId: user.businessId } } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (user.role !== "OWNER") {
      const access = await this.prisma.storeUser.findUnique({ where: { userId_storeId: { userId: user.userId, storeId: expense.storeId } } });
      if (!access) throw new NotFoundException("Expense not found");
    }
    return expense;
  }

  /** Which of these expenses have an accounting entry. */
  private async postedIds(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const links = await this.prisma.accountingSourceLink.findMany({
      where: { sourceType: "EXPENSE", sourceId: { in: ids }, skipped: false },
      select: { sourceId: true },
    });
    return new Set(links.map((l) => l.sourceId));
  }
}
