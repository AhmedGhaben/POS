import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { InventoryService } from "./inventory.service";

@Controller("stores/:storeId/inventory")
@UseGuards(StoreAccessGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findByStore(@Param("storeId") storeId: string) {
    return this.inventoryService.findByStore(storeId);
  }

  @Put(":productId")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  adjust(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjust(storeId, productId, dto);
  }
}
