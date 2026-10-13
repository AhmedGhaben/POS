import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CompanyService } from "./company.service";
import { CreateBankAccountDto, CreateTaxRateDto, UpdateBankAccountDto, UpdateTaxRateDto } from "./dto/company.dto";

/** Bank accounts: everyone reads them (they go on quotes); the owner changes them. */
@Controller("bank-accounts")
export class BankAccountsController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.company.listBankAccounts(user.businessId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankAccountDto) {
    return this.company.createBankAccount(user.businessId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateBankAccountDto) {
    return this.company.updateBankAccount(user.businessId, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.company.deleteBankAccount(user.businessId, id);
  }
}

/** Tax rates products can use: everyone reads them; the owner changes them. */
@Controller("tax-rates")
export class TaxRatesController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.company.listTaxRates(user.businessId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaxRateDto) {
    return this.company.createTaxRate(user.businessId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateTaxRateDto) {
    return this.company.updateTaxRate(user.businessId, id, dto);
  }
}
