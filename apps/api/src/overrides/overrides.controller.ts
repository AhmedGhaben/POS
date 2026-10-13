import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ApproversQuery, RequestOverrideDto } from "./dto/override.dto";
import { OverridesService } from "./overrides.service";

@Controller("overrides")
export class OverridesController {
  constructor(private readonly overrides: OverridesService) {}

  /** Who could approve this action here (for the approval popup). */
  @Get("approvers")
  approvers(@CurrentUser() user: AuthenticatedUser, @Query() query: ApproversQuery) {
    return this.overrides.approvers(user, query.permission, query.storeId);
  }

  /** A manager approves one action with their PIN; answers a single-use token. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  approve(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestOverrideDto) {
    return this.overrides.approve(user, dto);
  }
}
