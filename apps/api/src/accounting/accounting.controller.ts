import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { AccountingService } from "./accounting.service";
import { ChartService } from "./chart.service";
import { AccountingSettingsDto, CreateAccountDto, CreateFiscalYearDto, ReopenDto, UpdateAccountDto } from "./dto/accounting.dto";
import { PeriodsService } from "./periods.service";
import { IntegrationService } from "./integration.service";
import { periodDates } from "./periods";
import { YearEndService } from "./year-end.service";

/** Contabilidade: settings and the chart of accounts (docs/ACCOUNTING-DECISIONS.md). */
@Controller("accounting")
@UseGuards(RolesGuard)
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly chart: ChartService,
    private readonly periods: PeriodsService,
    private readonly integration: IntegrationService,
    private readonly yearEnd: YearEndService,
  ) {}

  @Get("status")
  @Roles(...ACCOUNTING_READ)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.accounting.status(user.businessId);
  }

  /** On/off and how POS documents are posted; the first time on installs the PGC chart. */
  @Patch("settings")
  @Roles(...ACCOUNTING_WRITE)
  settings(@CurrentUser() user: AuthenticatedUser, @Body() dto: AccountingSettingsDto) {
    return this.accounting.updateSettings(user.businessId, user.userId, dto);
  }

  @Get("accounts")
  @Roles(...ACCOUNTING_READ)
  accounts(@CurrentUser() user: AuthenticatedUser) {
    return this.chart.list(user.businessId);
  }

  @Post("accounts")
  @Roles(...ACCOUNTING_WRITE)
  createAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccountDto) {
    return this.chart.create(user.businessId, dto);
  }

  /** Opens the missing accounts of customers, suppliers, tills and bank accounts now. */
  @Post("accounts/sync")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  async syncAccounts(@CurrentUser() user: AuthenticatedUser) {
    return { created: await this.chart.ensureLinkedAccounts(user.businessId) };
  }

  @Patch("accounts/:id")
  @Roles(...ACCOUNTING_WRITE)
  updateAccount(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateAccountDto) {
    return this.chart.update(user.businessId, id, dto);
  }

  @Delete("accounts/:id")
  @Roles(...ACCOUNTING_WRITE)
  removeAccount(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.chart.remove(user.businessId, id);
  }

  @Get("years")
  @Roles(...ACCOUNTING_READ)
  years(@CurrentUser() user: AuthenticatedUser) {
    return this.periods.list(user.businessId);
  }

  @Post("years")
  @Roles(...ACCOUNTING_WRITE)
  async createYear(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFiscalYearDto) {
    await this.periods.ensureYear(null, user.businessId, dto.year);
    return (await this.periods.list(user.businessId)).find((y) => y.year === dto.year);
  }

  @Post("periods/:year/:number/close")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  async closePeriod(@CurrentUser() user: AuthenticatedUser, @Param("year", ParseIntPipe) year: number, @Param("number", ParseIntPipe) number: number) {
    // A month is closed with everything in it posted: post what's waiting first.
    if (number >= 1 && number <= 12) {
      await this.integration.run(user.businessId, user.userId);
      const { startDate, endDate } = periodDates(year, number);
      const { total } = await this.integration.pending(user.businessId, { from: startDate, to: endDate });
      if (total > 0) throw new BadRequestException(`${total} records of this period aren't posted yet: see the integration monitor`);
    }
    return this.periods.close(user.businessId, user.userId, year, number);
  }

  /** Opens a closed period again: owner (or accountant) only, with a reason; audit-logged. */
  @Post("periods/:year/:number/reopen")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  reopenPeriod(@CurrentUser() user: AuthenticatedUser, @Param("year", ParseIntPipe) year: number, @Param("number", ParseIntPipe) number: number, @Body() dto: ReopenDto) {
    return this.periods.reopen(user.businessId, user.userId, year, number, dto.reason);
  }

  @Get("years/:year/state")
  @Roles(...ACCOUNTING_READ)
  yearState(@CurrentUser() user: AuthenticatedUser, @Param("year", ParseIntPipe) year: number) {
    return this.yearEnd.state(user.businessId, year);
  }

  /** Apuramento de resultados: classes 6 and 7 into 82-86 (period 14), then 82-87 into 88 (period 15). */
  @Post("years/:year/results")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  workOutResults(@CurrentUser() user: AuthenticatedUser, @Param("year", ParseIntPipe) year: number) {
    return this.yearEnd.workOutResults(user.businessId, user.userId, year);
  }

  /** Closes the year and carries its balances into the next one's opening. */
  @Post("years/:year/close")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  closeYear(@CurrentUser() user: AuthenticatedUser, @Param("year", ParseIntPipe) year: number) {
    return this.yearEnd.close(user.businessId, user.userId, year);
  }

  @Post("years/:year/reopen")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  reopenYear(@CurrentUser() user: AuthenticatedUser, @Param("year", ParseIntPipe) year: number, @Body() dto: ReopenDto) {
    return this.yearEnd.reopen(user.businessId, user.userId, year, dto.reason);
  }
}
