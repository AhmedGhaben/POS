import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Permission, Prisma, Role, SaleStatus, ShiftStatus } from "@prisma/client";
import { PermissionsService } from "../common/permissions/permissions.service";
import { OverridesService } from "../overrides/overrides.service";
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

/**
 * What should be in the drawer: opening float + cash sales (what the sales
 * kept, i.e. after change) − cash refunds + cash in − cash out.
 */
export function computeExpectedCash(c: {
  openingFloat: Prisma.Decimal;
  cashSales: Prisma.Decimal;
  cashRefunds: Prisma.Decimal;
  cashIn: Prisma.Decimal;
  cashOut: Prisma.Decimal;
}): Prisma.Decimal {
  return c.openingFloat.add(c.cashSales).sub(c.cashRefunds).add(c.cashIn).sub(c.cashOut);
}

/**
 * The note/coin count, if given, must be whole non-negative numbers of
 * positive values and add up to the counted cash. Returns the cleaned map.
 */
export function checkDenominations(
  counted: Prisma.Decimal,
  denominations: Record<string, number> | undefined,
): Record<string, number> | null {
  if (!denominations) return null;
  const clean: Record<string, number> = {};
  let total = ZERO;
  for (const [value, count] of Object.entries(denominations)) {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0 || !Number.isInteger(count) || count < 0) {
      throw new BadRequestException("The count by note and coin isn't valid");
    }
    if (count === 0) continue;
    clean[value] = count;
    total = total.add(new Prisma.Decimal(value).mul(count));
  }
  if (!total.equals(counted)) throw new BadRequestException("The notes and coins don't add up to the counted cash");
  return clean;
}

/** Over the threshold (either way) → flagged for managers. */
export function isFlagged(difference: Prisma.Decimal, threshold: Prisma.Decimal | null): boolean {
  return threshold !== null && difference.abs().gt(threshold);
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
  /** Every sale, oldest first, for the report's optional full list. */
  sales: { receiptNumber: string; at: Date; total: string; method: PaymentMethod | "SPLIT"; voided: boolean; cashier: string }[];
  /** Opening float + cash taken - cash refunds + cash in - cash out. */
  expectedCash: string;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly overrides: OverridesService,
  ) {}

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

  /**
   * Cash put into or taken out of the drawer during an open shift, with a
   * reason. Taking cash out needs CASH_OUT or a manager's approval (online:
   * the X-Override-Token; offline: the approver the till checked).
   */
  async addMovement(user: AuthenticatedUser, dto: CashMovementDto, overrideToken?: string) {
    const shift = await this.byClientOrThrow(dto.storeId, dto.shiftClientId);
    const existing = await this.prisma.cashMovement.findUnique({
      where: { shiftId_clientId: { shiftId: shift.id, clientId: dto.clientId } },
    });
    if (!existing) {
      if (shift.status === ShiftStatus.CLOSED) throw new BadRequestException("This shift is closed");
      let approvedById: string | null = null;
      if (dto.type === "OUT" && !(await this.permissions.hasPermission(user.userId, user.role, Permission.CASH_OUT))) {
        const details = { amount: dto.amount, reason: dto.reason, shiftId: shift.id };
        if (dto.offline && dto.offlineOverride) {
          approvedById = (
            await this.overrides.recordOffline(user, { ...dto.offlineOverride, action: "cash.out", storeId: dto.storeId, details })
          ).approvedById;
        } else if (overrideToken) {
          approvedById = (await this.overrides.consume(overrideToken, user, Permission.CASH_OUT)).approvedById;
        } else if (!dto.offline) {
          throw new ForbiddenException("Taking cash out needs a manager's approval");
        }
      }
      await this.prisma.cashMovement.create({
        data: {
          shiftId: shift.id,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          reason: dto.reason,
          note: dto.note?.trim() || null,
          userId: user.userId,
          approvedById,
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

    // The cashier closes their own shift; an owner or manager can close an
    // abandoned one for them (they enter the count; it's marked forced).
    const forced = shift.openedById !== user.userId;
    if (forced && user.role === Role.CASHIER) {
      throw new ForbiddenException("Only the cashier who opened this shift, or a manager, can close it");
    }
    const counted = new Prisma.Decimal(dto.countedCash);
    const denominations = checkDenominations(counted, dto.countedDenominations);
    const summary = await this.summarize(shift);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
      select: { shiftDifferenceThreshold: true },
    });
    const difference = counted.sub(summary.expectedCash);
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
        difference,
        countedDenominations: denominations ?? undefined,
        forcedClose: forced,
        flagged: isFlagged(difference, business.shiftDifferenceThreshold),
        note: dto.note?.trim() || null,
      },
      include: SHIFT_INCLUDE,
    });
    if (forced) {
      await this.prisma.auditLog.create({
        data: {
          businessId: user.businessId,
          userId: user.userId,
          action: "SHIFT_FORCE_CLOSED",
          entityType: "shift",
          entityId: shift.id,
          metadata: { openedBy: shift.openedById, countedCash: counted.toFixed(2), difference: difference.toFixed(2) },
        },
      });
    }
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
      ...(query.status ? { status: query.status } : {}),
      ...(query.flagged ? { flagged: query.flagged === "true" } : {}),
      ...(query.cashierId ? { openedById: query.cashierId } : {}),
      ...(query.terminalId ? { terminalId: query.terminalId } : {}),
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
        orderBy: { createdAt: "asc" },
        select: {
          receiptNumber: true,
          createdAt: true,
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
      sales: sales.map((s) => ({
        receiptNumber: s.receiptNumber,
        at: s.createdAt,
        total: s.total.toFixed(2),
        method: s.payments.length === 1 ? s.payments[0].method : "SPLIT",
        voided: s.status === SaleStatus.VOIDED,
        cashier: `${s.cashier.firstName} ${s.cashier.lastName}`,
      })),
      expectedCash: computeExpectedCash({ openingFloat: shift.openingFloat, cashSales, cashRefunds, cashIn, cashOut }).toFixed(2),
    };
  }
}
