import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { AccountingService } from "./accounting.service";
import { ChartService } from "./chart.service";
import { AccountingSettingsDto, CreateAccountDto, UpdateAccountDto } from "./dto/accounting.dto";

/** Contabilidade: settings and the chart of accounts (docs/ACCOUNTING-DECISIONS.md). */
@Controller("accounting")
@UseGuards(RolesGuard)
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly chart: ChartService,
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
}
