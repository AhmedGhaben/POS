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

/** Contabilidade: the books, posted from the POS (docs/ACCOUNTING-DECISIONS.md). */
@Module({
  controllers: [AccountingController, EntriesController, IntegrationController],
  providers: [AccountingService, ChartService, PeriodsService, EntriesService, IntegrationService, MappingService, TemplatesService],
  exports: [AccountingService, ChartService, PeriodsService, EntriesService, IntegrationService],
})
export class AccountingModule {}
