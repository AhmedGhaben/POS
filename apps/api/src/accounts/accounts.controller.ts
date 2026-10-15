import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { Permission, Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiresPermission } from "../common/decorators/requires-permission.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CustomerAccountsService } from "./customer-accounts.service";
import { AnnulPaymentDto, CreateCustomerPaymentDto, CreateSupplierPaymentDto } from "./dto/payments.dto";
import { SupplierAccountsService } from "./supplier-accounts.service";

/** Customer and supplier accounts (docs/plans/ANGOLA.md, phase 4). */
@Controller()
export class AccountsController {
  constructor(
    private readonly customers: CustomerAccountsService,
    private readonly suppliers: SupplierAccountsService,
  ) {}

  /** Limit, balance, invoices and receipts: also shown at the till on the customer card. */
  @Get("customers/:id/account")
  customerAccount(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.customers.account(user.businessId, id);
  }

  /** A customer pays towards their invoices: a receipt (RC). */
  @Post("customer-payments")
  @UseGuards(StoreAccessGuard)
  receive(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerPaymentDto) {
    return this.customers.receive(user, dto);
  }

  @Get("customer-payments/:id")
  customerPayment(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.customers.getPayment(user.businessId, id);
  }

  /** Annuls a receipt made by mistake (like cancelling a sale). */
  @Post("customer-payments/:id/annul")
  @HttpCode(200)
  @RequiresPermission(Permission.VOID_SALE)
  annul(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: AnnulPaymentDto) {
    return this.customers.annul(user, id, dto.reason);
  }

  @Get("suppliers/:id/account")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  supplierAccount(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.suppliers.account(user.businessId, id);
  }

  @Post("supplier-payments")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  pay(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierPaymentDto) {
    return this.suppliers.pay(user, dto);
  }

  @Post("supplier-payments/:id/cancel")
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: AnnulPaymentDto) {
    return this.suppliers.cancel(user, id, dto.reason);
  }
}
