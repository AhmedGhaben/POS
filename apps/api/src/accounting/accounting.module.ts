import { Module } from "@nestjs/common";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { ChartService } from "./chart.service";
import { PeriodsService } from "./periods.service";
import { EntriesController } from "./entries.controller";
import { EntriesService } from "./entries.service";
import { IntegrationController } from "./integration.controller";
import { IntegrationService } from "./integration.service";
import { MappingService } from "./mapping.service";
import { TemplatesService } from "./templates.service";
import { AccountingReportsController } from "./reports.controller";
import { AccountingReportsService } from "./accounting-reports.service";
import { YearEndService } from "./year-end.service";
import { AccountingSaftService } from "./accounting-saft.service";

/** Contabilidade: the books, posted from the POS (docs/ACCOUNTING-DECISIONS.md). */
@Module({
  controllers: [AccountingController, EntriesController, IntegrationController, AccountingReportsController],
  providers: [AccountingService, ChartService, PeriodsService, EntriesService, IntegrationService, MappingService, TemplatesService, AccountingReportsService, YearEndService, AccountingSaftService],
  exports: [AccountingService, ChartService, PeriodsService, EntriesService, IntegrationService],
})
export class AccountingModule {}
