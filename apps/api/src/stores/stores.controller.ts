import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { AssignStoreUserDto } from "./dto/assign-store-user.dto";
import { CreateStoreDto } from "./dto/create-store.dto";
import { StoresService } from "./stores.service";

@Controller("stores")
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  findAccessible(@CurrentUser() user: AuthenticatedUser) {
    return this.storesService.findAccessible(user.businessId, user.userId, user.role);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStoreDto) {
    return this.storesService.create(user.businessId, dto);
  }

  @Post(":storeId/users")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  assignUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Body() dto: AssignStoreUserDto,
  ) {
    return this.storesService.assignUser(user.businessId, storeId, dto.userId);
  }
}
