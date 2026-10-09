import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateTerminalDto, UpdateTerminalDto } from "./dto/terminal.dto";
import { TerminalsService } from "./terminals.service";

/** Physical tills running the desktop app. Setting one up needs a manager. */
@Controller("terminals")
export class TerminalsController {
  constructor(private readonly terminalsService: TerminalsService) {}

  @Post()
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTerminalDto) {
    return this.terminalsService.create(user.businessId, dto);
  }

  @Get()
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("storeId") storeId?: string) {
    return this.terminalsService.findAll(user, storeId);
  }

  /** Any signed-in user of the business: the till shows its own name. */
  @Get(":terminalId")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("terminalId") id: string) {
    return this.terminalsService.findOne(user.businessId, id);
  }

  @Patch(":terminalId")
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("terminalId") id: string,
    @Body() dto: UpdateTerminalDto,
  ) {
    return this.terminalsService.update(user, id, dto);
  }
}
