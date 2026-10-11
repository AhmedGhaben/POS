import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { Permission } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiresPermission } from "../common/decorators/requires-permission.decorator";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { VoidSaleDto } from "./dto/void-sale.dto";
import { SalesService } from "./sales.service";

@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get("store/:storeId")
  @UseGuards(StoreAccessGuard)
  findByStore(@Param("storeId") storeId: string) {
    return this.salesService.findByStore(storeId);
  }

  @Post()
  @UseGuards(StoreAccessGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user.businessId, user.userId, dto);
  }

  /** Cancels a sale; repeating it returns the cancelled sale. */
  @Post("void")
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  @RequiresPermission(Permission.VOID_SALE)
  void(@CurrentUser() user: AuthenticatedUser, @Body() dto: VoidSaleDto) {
    return this.salesService.void(user.userId, dto);
  }
}
