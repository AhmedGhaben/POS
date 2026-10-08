import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { IssueInvoiceDto } from "./dto/issue-invoice.dto";
import { ListInvoicesDto } from "./dto/list-invoices.dto";
import { InvoicesService } from "./invoices.service";

@Controller()
@UseGuards(RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /** Any role, for sales at a store they can use: cashiers invoice at the till. */
  @Post("sales/:saleId/invoice")
  issue(@CurrentUser() user: AuthenticatedUser, @Param("saleId") saleId: string, @Body() dto: IssueInvoiceDto) {
    return this.invoicesService.issueForSale(user, saleId, dto);
  }

  @Get("invoices")
  @Roles(Role.OWNER, Role.MANAGER)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListInvoicesDto) {
    return this.invoicesService.findAll(user.businessId, query);
  }

  @Get("invoices/:invoiceId")
  @Roles(Role.OWNER, Role.MANAGER)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("invoiceId") invoiceId: string) {
    return this.invoicesService.findOne(user.businessId, invoiceId);
  }
}
