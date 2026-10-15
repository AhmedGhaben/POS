import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateProformaDto } from "./dto/create-proforma.dto";
import { FiscalService } from "./fiscal.service";

/**
 * Fiscal documents: read and print them. There's no route to change or
 * delete one (the database refuses too); an FR is annulled by cancelling
 * its sale, and corrected with a credit note (a return).
 */
@Controller("fiscal-documents")
export class FiscalController {
  constructor(private readonly fiscal: FiscalService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("storeId") storeId?: string,
    @Query("type") type?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("search") search?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    const [items, total] = await this.fiscal.list(user.businessId, {
      storeId,
      type,
      from,
      to,
      search,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    return { items, total };
  }

  /** A till's series and next numbers (it numbers its own documents, offline too). */
  @Get("series/till/:terminalId")
  tillSeries(@CurrentUser() user: AuthenticatedUser, @Param("terminalId") terminalId: string) {
    return this.fiscal.tillSeries(user.businessId, terminalId);
  }

  @Post("proformas")
  @UseGuards(StoreAccessGuard)
  createProforma(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProformaDto) {
    return this.fiscal.createProforma(user.businessId, user.userId, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.fiscal.get(user.businessId, id);
  }
}
