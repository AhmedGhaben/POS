import { Controller, Get, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TerminalStatusService } from "./terminal-status.service";

/** "Lojas agora" on the dashboard: owners (every store) and managers (their stores). */
@Controller("stores")
export class StoreStatusController {
  constructor(private readonly status: TerminalStatusService) {}

  @Get("status")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  storesStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.status.storesStatus(user);
  }
}
