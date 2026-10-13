import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.findAll(user.businessId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.businessId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  rename(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.rename(user.businessId, id, dto);
  }

  /** ?reassignTo=<category id> moves its products there; without it they're left uncategorized. */
  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("reassignTo") reassignTo?: string) {
    return this.categoriesService.remove(user.businessId, id, reassignTo || null);
  }
}
