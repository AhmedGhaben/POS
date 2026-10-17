import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { parseCalendarDate } from "../fiscal/saft/period";
import { businessToday, dateValue, isoDate } from "./accounting-dates";
import { ChartService } from "./chart.service";
import { PeriodsService } from "./periods.service";
import { EntriesService } from "./entries.service";
import { AccountingSettingsDto } from "./dto/accounting.dto";

/** Contabilidade on or off, and its settings (docs/ACCOUNTING-DECISIONS.md). */
@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chart: ChartService,
    private readonly periods: PeriodsService,
    private readonly entries: EntriesService,
  ) {}

  async status(businessId: string) {
    const business = await this.business(businessId);
    const settings = await this.prisma.accountingSettings.findUnique({ where: { businessId } });
    const accounts = await this.prisma.ledgerAccount.count({ where: { businessId } });
    return {
      enabled: settings?.enabled ?? false,
      settings: settings
        ? {
            startDate: isoDate(settings.startDate),
            cashPerTill: settings.cashPerTill,
            grouping: settings.grouping,
            autoPost: settings.autoPost,
            purchasesFile: settings.purchasesFile,
            enabledAt: settings.enabledAt,
          }
        : null,
      accounts,
      today: businessToday(business),
    };
  }

  /**
   * Turns the books on (first time: the PGC template and the app's own
   * sub-accounts) or changes the settings. Turning them off keeps everything.
   */
  async updateSettings(businessId: string, userId: string, dto: AccountingSettingsDto) {
    const business = await this.business(businessId);
    const existing = await this.prisma.accountingSettings.findUnique({ where: { businessId } });
    const startDate = dto.startDate ? parseCalendarDate(dto.startDate) : existing ? isoDate(existing.startDate) : `${businessToday(business).slice(0, 4)}-01-01`;
    const turningOn = dto.enabled === true && !existing?.enabled;
    await this.prisma.$transaction(async (tx) => {
      await tx.accountingSettings.upsert({
        where: { businessId },
        create: {
          businessId,
          enabled: dto.enabled ?? false,
          startDate: dateValue(startDate),
          cashPerTill: dto.cashPerTill ?? true,
          grouping: dto.grouping ?? "PER_DOCUMENT",
          autoPost: dto.autoPost ?? true,
          purchasesFile: dto.purchasesFile ?? "AUTO",
          ...(turningOn ? { enabledAt: new Date(), enabledById: userId } : {}),
        },
        update: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          startDate: dateValue(startDate),
          ...(dto.cashPerTill !== undefined ? { cashPerTill: dto.cashPerTill } : {}),
          ...(dto.grouping ? { grouping: dto.grouping } : {}),
          ...(dto.autoPost !== undefined ? { autoPost: dto.autoPost } : {}),
          ...(dto.purchasesFile ? { purchasesFile: dto.purchasesFile } : {}),
          ...(turningOn ? { enabledAt: new Date(), enabledById: userId } : {}),
        },
      });
      if (turningOn) {
        await this.chart.installTemplate(tx, businessId);
        await this.entries.installJournals(tx, businessId);
      }
      // The years the integration posts into from the start.
      for (let year = Number(startDate.slice(0, 4)); year <= Number(businessToday(business).slice(0, 4)); year++) await this.periods.ensureYear(tx, businessId, year);
    });
    if (turningOn || dto.cashPerTill) await this.chart.ensureLinkedAccounts(businessId);
    return this.status(businessId);
  }

  private async business(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException("Business not found");
    return business;
  }
}
