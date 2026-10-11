import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, Role, SaleStatus, ShiftStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CashMovementDto, CloseShiftDto, ListShiftsQuery, OpenShiftDto } from "./dto/shift.dto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

const SHIFT_INCLUDE = {
  openedBy: PERSON,
  closedBy: PERSON,
  terminal: { select: { id: true, name: true, code: true } },
  store: { select: { id: true, name: true } },
} satisfies Prisma.ShiftInclude;

type ShiftWithPeople = Prisma.ShiftGetPayload<{ include: typeof SHIFT_INCLUDE }>;

const ZERO = new Prisma.Decimal(0);
const sum = (values: Prisma.Decimal[]) => values.reduce((a, b) => a.add(b), ZERO);

/** A time the till reported, never in the future. */
function tillTime(value: string | undefined): Date {
  if (!value) return new Date();
  const at = new Date(value);
  return Number.isNaN(at.getTime()) || at.getTime() > Date.now() + MAX_CLOCK_SKEW_MS ? new Date() : at;
}

export interface ShiftSummary {
  salesCount: number;
  salesTotal: string;
  byMethod: Partial<Record<PaymentMethod, string>>;
  discounts: string;
  voided: { count: number; total: string };
  returns: { count: number; total: string; cash: string };
  cashIn: string;
  cashOut: string;
  movements: { id: string; type: "IN" | "OUT"; amount: string; reason: string; note: string | null; occurredAt: Date; user: string }[];
  byCashier: { id: string; name: string; count: number; total: string }[];
  /** Opening float + cash taken - cash refunds + cash in - cash out. */
  expectedCash: string;
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  private findByClientId(storeId: string, clientId: string) {
    return this.prisma.shift.findUnique({
      where: { storeId_clientId: { storeId, clientId } },
      include: SHIFT_INCLUDE,
    });
  }

  private async byClientOrThrow(storeId: string, clientId: string) {
    const shift = await this.findByClientId(storeId, clientId);
    if (!shift) throw new NotFoundException("Shift not found");
    return shift;
  }

  /**
   * Opens a shift on a till (or, in a browser, for this person in this
   * store). A till has one open shift at a time. Repeating it (the till
   * retrying an upload) returns the same shift.
   */
  async open(user: AuthenticatedUser, dto: OpenShiftDto) {
    const existing = await this.findByClientId(dto.storeId, dto.clientId);
    if (existing) return this.report(existing);

    let terminalId: string | null = null;
    if (dto.terminalId) {
      const terminal = await this.prisma.terminal.findFirst({
        where: { id: dto.terminalId, businessId: user.businessId },
        select: { id: true },
      });
      terminalId = terminal?.id ?? null;
    }

    const shift = await this.prisma.$transaction(async (tx) => {
      const open = await tx.shift.findFirst({
        where: terminalId
          ? { terminalId, status: ShiftStatus.OPEN }
          : { storeId: dto.storeId, terminalId: null, openedById: user.userId, status: ShiftStatus.OPEN },
        select: { id: true },
      });
      if (open) throw new ConflictException("This till already has an open shift");
      return tx.shift.create({
        data: {
          businessId: user.businessId,
          storeId: dto.storeId,
          terminalId,
          openedById: user.userId,
          openedAt: tillTime(dto.openedAt),
          openingFloat: new Prisma.Decimal(dto.openingFloat),
          clientId: dto.clientId,
          createdOffline: !!dto.offline,
        },
        include: SHIFT_INCLUDE,
      });
    });
    return this.report(shift);
  }

  /** Cash put into or taken out of the drawer during an open shift. */
  async addMovement(user: AuthenticatedUser, dto: CashMovementDto) {
    const shift = await this.byClientOrThrow(dto.storeId, dto.shiftClientId);
    const existing = await this.prisma.cashMovement.findUnique({
      where: { shiftId_clientId: { shiftId: shift.id, clientId: dto.clientId } },
    });
    if (!existing) {
      if (shift.status === ShiftStatus.CLOSED) throw new BadRequestException("This shift is closed");
      await this.prisma.cashMovement.create({
        data: {
          shiftId: shift.id,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          reason: dto.reason,
          note: dto.note?.trim() || null,
          userId: user.userId,
          occurredAt: tillTime(dto.occurredAt),
          clientId: dto.clientId,
          createdOffline: !!dto.offline,
        },
      });
    }
    return this.report(shift);
  }

  /**
   * Closes a shift with the cashier's count. The expected cash comes from
   * the server's own records; the till's figure is kept beside it, since the
   * till may know about sales that haven't uploaded yet.
   */
  async close(user: AuthenticatedUser, dto: CloseShiftDto) {
    const shift = await this.byClientOrThrow(dto.storeId, dto.shiftClientId);
    if (shift.status === ShiftStatus.CLOSED) return this.report(shift);

    const summary = await this.summarize(shift);
    const counted = new Prisma.Decimal(dto.countedCash);
    const closedAt = tillTime(dto.closedAt);
    const closed = await this.prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: ShiftStatus.CLOSED,
        closedById: user.userId,
        closedAt: closedAt < shift.openedAt ? shift.openedAt : closedAt,
        countedCash: counted,
        expectedCash: new Prisma.Decimal(summary.expectedCash),
        tillExpectedCash: dto.tillExpectedCash !== undefined ? new Prisma.Decimal(dto.tillExpectedCash) : null,
        difference: counted.sub(summary.expectedCash),
        note: dto.note?.trim() || null,
      },
      include: SHIFT_INCLUDE,
    });
    return this.report(closed);
  }

  /** The open shift on this till (or this person's, in a browser), if any. */
  async current(user: AuthenticatedUser, storeId: string, terminalId?: string) {
    const shift = await this.prisma.shift.findFirst({
      where: terminalId
        ? { terminalId, storeId, status: ShiftStatus.OPEN, store: { businessId: user.businessId } }
        : { storeId, terminalId: null, openedById: user.userId, status: ShiftStatus.OPEN },
      include: SHIFT_INCLUDE,
      orderBy: { openedAt: "desc" },
    });
    return shift ? this.report(shift) : null;
  }

  async findAll(user: AuthenticatedUser, query: ListShiftsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ShiftWhereInput = {
      businessId: user.businessId,
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(user.role !== Role.OWNER && !query.storeId
        ? { store: { storeUsers: { some: { userId: user.userId } } } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shift.findMany({
        where,
        include: SHIFT_INCLUDE,
        orderBy: { openedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.shift.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id, businessId: user.businessId }, include: SHIFT_INCLUDE });
    if (!shift) throw new NotFoundException("Shift not found");
    return this.report(shift);
  }

  async findByClient(user: AuthenticatedUser, storeId: string, clientId: string) {
    const shift = await this.findByClientId(storeId, clientId);
    if (!shift || shift.businessId !== user.businessId) throw new NotFoundException("Shift not found");
    return this.report(shift);
  }

  private async report(shift: ShiftWithPeople) {
    return { ...shift, summary: await this.summarize(shift) };
  }

  /** The end-of-shift report: sales, payments, discounts, cancels, returns, cash. */
  async summarize(shift: { id: string; openingFloat: Prisma.Decimal }): Promise<ShiftSummary> {
    const [sales, returns, movements] = await Promise.all([
      this.prisma.sale.findMany({
        where: { shiftId: shift.id },
        select: {
          status: true,
          total: true,
          discountTotal: true,
          cashier: PERSON,
          payments: { select: { method: true, amount: true } },
        },
      }),
      this.prisma.return.findMany({ where: { shiftId: shift.id }, select: { totalRefund: true, refundMethod: true } }),
      this.prisma.cashMovement.findMany({
        where: { shiftId: shift.id },
        include: { user: PERSON },
        orderBy: { occurredAt: "asc" },
      }),
    ]);

    const completed = sales.filter((s) => s.status === SaleStatus.COMPLETED);
    const voided = sales.filter((s) => s.status === SaleStatus.VOIDED);
    const byMethod = new Map<PaymentMethod, Prisma.Decimal>();
    for (const s of completed) {
      for (const p of s.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? ZERO).add(p.amount));
    }
    const byCashier = new Map<string, { id: string; name: string; count: number; total: Prisma.Decimal }>();
    for (const s of completed) {
      const row = byCashier.get(s.cashier.id) ?? {
        id: s.cashier.id,
        name: `${s.cashier.firstName} ${s.cashier.lastName}`,
        count: 0,
        total: ZERO,
      };
      row.count++;
      row.total = row.total.add(s.total);
      byCashier.set(s.cashier.id, row);
    }

    const cashSales = byMethod.get(PaymentMethod.CASH) ?? ZERO;
    const cashRefunds = sum(returns.filter((r) => r.refundMethod === PaymentMethod.CASH).map((r) => r.totalRefund));
    const cashIn = sum(movements.filter((m) => m.type === "IN").map((m) => m.amount));
    const cashOut = sum(movements.filter((m) => m.type === "OUT").map((m) => m.amount));

    return {
      salesCount: completed.length,
      salesTotal: sum(completed.map((s) => s.total)).toFixed(2),
      byMethod: Object.fromEntries([...byMethod].map(([m, v]) => [m, v.toFixed(2)])),
      discounts: sum(completed.map((s) => s.discountTotal)).toFixed(2),
      voided: { count: voided.length, total: sum(voided.map((s) => s.total)).toFixed(2) },
      returns: { count: returns.length, total: sum(returns.map((r) => r.totalRefund)).toFixed(2), cash: cashRefunds.toFixed(2) },
      cashIn: cashIn.toFixed(2),
      cashOut: cashOut.toFixed(2),
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount.toFixed(2),
        reason: m.reason,
        note: m.note,
        occurredAt: m.occurredAt,
        user: `${m.user.firstName} ${m.user.lastName}`,
      })),
      byCashier: [...byCashier.values()].map((r) => ({ ...r, total: r.total.toFixed(2) })),
      expectedCash: shift.openingFloat.add(cashSales).sub(cashRefunds).add(cashIn).sub(cashOut).toFixed(2),
    };
  }
}
