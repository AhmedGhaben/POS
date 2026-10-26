import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Permission, Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { paging } from "../common/store-period";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiresPermission } from "../common/decorators/requires-permission.decorator";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { VoidSaleDto } from "./dto/void-sale.dto";
import { TillUpload } from "../till/terminal-key.guard";
import { SalesService } from "./sales.service";

@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get("store/:storeId")
  @UseGuards(StoreAccessGuard)
  findByStore(@Param("storeId") storeId: string) {
    return this.salesService.findByStore(storeId);
  }

  /**
   * Sales history (back office): ?storeId&from&to (YYYY-MM-DD, the store's
   * days)&status&cashierId&search (receipt, document number, customer)&take&skip.
   */
  @Get()
  @UseGuards(StoreAccessGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  list(
    @Query("storeId") storeId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: string,
    @Query("cashierId") cashierId?: string,
    @Query("search") search?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    if (!storeId) throw new BadRequestException("Choose a store");
    return this.salesService.list(storeId, { from, to, status, cashierId, search: search?.trim() || undefined, ...paging(take, skip) });
  }

  /** Whether the receipt emailed with a sale went: PENDING, SENT or FAILED (with why). */
  @Get(":id/receipt-email")
  receiptEmail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.salesService.receiptEmailStatus(user, id);
  }

  @Post()
  @TillUpload()
  @UseGuards(StoreAccessGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user.businessId, user.userId, dto, user.role);
  }

  /** Cancels a sale; repeating it returns the cancelled sale. */
  @Post("void")
  @TillUpload()
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  @RequiresPermission(Permission.VOID_SALE)
  void(@CurrentUser() user: AuthenticatedUser, @Body() dto: VoidSaleDto) {
    return this.salesService.void(user.userId, dto);
  }
}
