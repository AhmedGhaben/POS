import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { paging } from "../common/store-period";
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

  /** Filtered and paged: ?storeId&supplierId&paymentStatus&search&from&to (YYYY-MM-DD)&take&skip. */
  @Get()
  @UseGuards(StoreAccessGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  list(
    @Query("storeId") storeId: string,
    @Query("supplierId") supplierId?: string,
    @Query("paymentStatus") paymentStatus?: string,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    if (!storeId) throw new BadRequestException("Choose a store");
    return this.purchasesService.list(storeId, { supplierId, paymentStatus, search: search?.trim() || undefined, from, to, ...paging(take, skip) });
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.purchasesService.get(user.businessId, id);
  }

  @Post()
  @UseGuards(StoreAccessGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(user.businessId, user.userId, dto);
  }
}
