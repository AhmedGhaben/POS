import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FiscalYear, PeriodStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { dateValue, isoDate } from "./accounting-dates";
import { PERIOD_NUMBERS, periodDates } from "./periods";

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Fiscal years and their periods (step A2). A closed period takes no
 * postings; reopening one is logged with who and why.
 */
@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The year with its 16 periods, created the first time it's needed (serialised per business). */
  async ensureYear(db: Prisma.TransactionClient | null, businessId: string, year: number): Promise<FiscalYear> {
    if (!db) return this.prisma.$transaction((tx) => this.ensureYear(tx, businessId, year));
    if (year < 2000 || year > 9999) throw new BadRequestException("That year is out of range");
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fiscal-year:${businessId}`}))`;
    const existing = await db.fiscalYear.findUnique({ where: { businessId_year: { businessId, year } } });
    if (existing) return existing;
    return db.fiscalYear.create({
      data: {
        businessId,
        year,
        startDate: dateValue(`${year}-01-01`),
        endDate: dateValue(`${year}-12-31`),
        periods: {
          create: PERIOD_NUMBERS.map((number) => {
            const d = periodDates(year, number);
            return { businessId, year, number, startDate: dateValue(d.startDate), endDate: dateValue(d.endDate) };
          }),
        },
      },
    });
  }

  async list(businessId: string) {
    const years = await this.prisma.fiscalYear.findMany({ where: { businessId }, orderBy: { year: "desc" } });
    const periods = await this.prisma.accountingPeriod.findMany({ where: { businessId }, orderBy: [{ year: "desc" }, { number: "asc" }] });
    const userIds = [...new Set([...years.map((y) => y.closedById), ...periods.map((p) => p.closedById)].filter((id): id is string => !!id))];
    const users = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );
    return years.map((y) => ({
      year: y.year,
      startDate: isoDate(y.startDate),
      endDate: isoDate(y.endDate),
      status: y.status,
      closedAt: y.closedAt,
      closedBy: y.closedById ? (users.get(y.closedById) ?? null) : null,
      periods: periods
        .filter((p) => p.year === y.year)
        .map((p) => ({
          number: p.number,
          startDate: isoDate(p.startDate),
          endDate: isoDate(p.endDate),
          status: p.status,
          closedAt: p.closedAt,
          closedBy: p.closedById ? (users.get(p.closedById) ?? null) : null,
        })),
    }));
  }

  async period(db: Db, businessId: string, year: number, number: number) {
    const period = await db.accountingPeriod.findUnique({ where: { businessId_year_number: { businessId, year, number } } });
    if (!period) throw new NotFoundException("Accounting period not found");
    return period;
  }

  async close(businessId: string, userId: string, year: number, number: number) {
    const period = await this.period(this.prisma, businessId, year, number);
    if (period.status === PeriodStatus.CLOSED) return period;
    const updated = await this.prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: PeriodStatus.CLOSED, closedAt: new Date(), closedById: userId } });
    await this.log(businessId, userId, "ACCOUNTING_PERIOD_CLOSED", { year, period: number });
    return updated;
  }

  /** Reopening needs a reason; it's in the audit log. A closed year stays closed. */
  async reopen(businessId: string, userId: string, year: number, number: number, reason: string) {
    const period = await this.period(this.prisma, businessId, year, number);
    const fiscalYear = await this.prisma.fiscalYear.findUniqueOrThrow({ where: { id: period.fiscalYearId } });
    if (fiscalYear.status === PeriodStatus.CLOSED) throw new BadRequestException("The year is closed: reopen the year first");
    if (period.status === PeriodStatus.OPEN) return period;
    const updated = await this.prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: PeriodStatus.OPEN, closedAt: null, closedById: null } });
    await this.log(businessId, userId, "ACCOUNTING_PERIOD_REOPENED", { year, period: number, reason: reason.trim(), closedAt: period.closedAt?.toISOString() ?? null, closedById: period.closedById });
    return updated;
  }

  async log(businessId: string, userId: string, action: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { businessId, userId, action, entityType: "Accounting", metadata } });
  }
}
