import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateDrawerEventDto, ListDrawerEventsQuery } from "./dto/drawer-event.dto";
import { DrawerEventsService } from "./drawer-events.service";

@Controller("drawer-events")
export class DrawerEventsController {
  constructor(private readonly drawerEvents: DrawerEventsService) {}

  /** Any signed-in user at a till they have store access to. */
  @Post()
  @UseGuards(StoreAccessGuard)
  record(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDrawerEventDto) {
    return this.drawerEvents.record(user, dto);
  }

  @Get()
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDrawerEventsQuery) {
    return this.drawerEvents.findAll(user, query);
  }
}
