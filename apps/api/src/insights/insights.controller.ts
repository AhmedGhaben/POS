import { Controller, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { ReportQueryDto } from "../reports/dto/report-query.dto";
import { InsightsService } from "./insights.service";

/** POST, not GET — unlike the plain-query ReportsController endpoints, this one
 * calls an external LLM on every request, so it shouldn't look cacheable/free. */
@Controller("insights")
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Post("store/:storeId")
  @UseGuards(StoreAccessGuard)
  generate(@Param("storeId") storeId: string, @Query() query: ReportQueryDto) {
    return this.insightsService.generate(storeId, query.days ?? 30);
  }
}
