import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserPermissionDto } from "./dto/update-user-permission.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user.businessId);
  }

  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.businessId, dto);
  }

  /** Granting/revoking permissions is authority-escalation — Owner only,
   * unlike most other role-gated endpoints which also allow Manager. */
  @Get(":userId/permissions")
  @Roles(Role.OWNER)
  getPermissions(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return this.usersService.getEffectivePermissions(user.businessId, userId);
  }

  @Patch(":userId/permissions")
  @Roles(Role.OWNER)
  setPermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") userId: string,
    @Body() dto: UpdateUserPermissionDto,
  ) {
    return this.usersService.setPermissionOverride(
      user.businessId,
      userId,
      dto.permission,
      dto.granted,
    );
  }
}
