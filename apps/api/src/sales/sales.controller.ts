import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateSaleDto } from "./dto/create-sale.dto";
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
}
