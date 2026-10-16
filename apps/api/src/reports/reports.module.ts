import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { ReportTablesService } from "./report-tables.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportTablesService],
  exports: [ReportsService],
})
export class ReportsModule {}
