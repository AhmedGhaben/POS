import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";
import { PurchasesService } from "./purchases.service";

@Controller("purchases")
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get("store/:storeId")
  @UseGuards(StoreAccessGuard)
  findByStore(@Param("storeId") storeId: string) {
    return this.purchasesService.findByStore(storeId);
  }

  @Post()
  @UseGuards(StoreAccessGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(user.businessId, user.userId, dto);
  }
}
