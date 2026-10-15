import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateSupplierDto, UpdateSupplierDto } from "./dto/create-supplier.dto";
import { SuppliersService } from "./suppliers.service";

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /** `withBalance=true` adds what is owed to each (owners and managers see it on the Suppliers page). */
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("withBalance") withBalance?: string) {
    return this.suppliersService.findAll(user.businessId, withBalance === "true" && user.role !== Role.CASHIER);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(user.businessId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(user.businessId, id, dto);
  }
}
