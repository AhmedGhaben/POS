import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { Permission, Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { PermissionsService } from "../common/permissions/permissions.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { InventoryService } from "./inventory.service";

/** Costs are for people who may see cost prices (VIEW_COST_PRICE). */
function withoutCosts<T extends { averageCost?: unknown; product?: { costPrice?: unknown } }>(item: T) {
  const { averageCost: _averageCost, ...rest } = item;
  if (!rest.product) return rest;
  const { costPrice: _costPrice, ...product } = rest.product;
  return { ...rest, product };
}

@Controller("stores/:storeId/inventory")
@UseGuards(StoreAccessGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly permissions: PermissionsService,
  ) {}

  private canSeeCosts(user: AuthenticatedUser) {
    return this.permissions.hasPermission(user.userId, user.role, Permission.VIEW_COST_PRICE);
  }

  @Get()
  async findByStore(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string) {
    const items = await this.inventoryService.findByStore(storeId);
    return (await this.canSeeCosts(user)) ? items : items.map(withoutCosts);
  }

  /** Stock and book value at the end of a day (?date=YYYY-MM-DD). */
  @Get("at")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async stockAt(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Query("date") date: string) {
    const rows = await this.inventoryService.stockAt(storeId, date ?? "");
    if (await this.canSeeCosts(user)) return rows;
    return rows.map(({ averageCost: _a, value: _v, ...row }) => row);
  }

  @Get(":productId/movements")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async history(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("productId") productId: string) {
    const movements = await this.inventoryService.history(storeId, productId);
    if (await this.canSeeCosts(user)) return movements;
    return movements.map(({ unitCost: _u, averageCost: _a, ...m }) => m);
  }

  @Put(":productId")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Body() dto: AdjustStockDto,
  ) {
    const item = await this.inventoryService.adjust(storeId, productId, dto, user.userId);
    return (await this.canSeeCosts(user)) ? item : withoutCosts(item);
  }
}
