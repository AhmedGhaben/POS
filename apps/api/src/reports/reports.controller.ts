import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ReportQueryDto, TopProductsQueryDto } from "./dto/report-query.dto";
import { ReportsService } from "./reports.service";
import { ReportTablesService } from "./report-tables.service";

@Controller("reports")
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly tables: ReportTablesService,
  ) {}

  /**
   * One of the back-office reports (report-tables.ts) for a period of the
   * store's calendar days; without a store, the whole business (owner only).
   */
  @Get("tables/:report")
  @UseGuards(StoreAccessGuard)
  table(
    @CurrentUser() user: AuthenticatedUser,
    @Param("report") report: string,
    @Query("storeId") storeId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.tables.run(user, report, { storeId: storeId || undefined, startDate, endDate });
  }

  @Get("store/:storeId/summary")
  @UseGuards(StoreAccessGuard)
  summary(@Param("storeId") storeId: string, @Query() query: ReportQueryDto) {
    return this.reportsService.summary(storeId, query.days);
  }

  @Get("store/:storeId/sales-trend")
  @UseGuards(StoreAccessGuard)
  salesTrend(@Param("storeId") storeId: string, @Query() query: ReportQueryDto) {
    return this.reportsService.salesTrend(storeId, query.days);
  }

  @Get("store/:storeId/top-products")
  @UseGuards(StoreAccessGuard)
  topProducts(@Param("storeId") storeId: string, @Query() query: TopProductsQueryDto) {
    return this.reportsService.topProducts(storeId, query.days, query.limit);
  }

  @Get("store/:storeId/low-stock")
  @UseGuards(StoreAccessGuard)
  lowStock(@Param("storeId") storeId: string) {
    return this.reportsService.lowStock(storeId);
  }

  /** Owner-only, spans every store in the business — not store-scoped. */
  @Get("business/store-comparison")
  @Roles(Role.OWNER)
  storeComparison(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    return this.reportsService.storeComparison(user.businessId, query.days);
  }
}
