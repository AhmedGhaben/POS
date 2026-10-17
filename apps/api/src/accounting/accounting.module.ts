import { Module } from "@nestjs/common";
import { MailModule } from "../common/mail/mail.module";
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
import { AccountantsController } from "./accountants.controller";
import { AccountantsService } from "./accountants.service";
import { ArchiveController } from "./archive.controller";
import { ArchiveService } from "./archive.service";

/** Contabilidade: the books, posted from the POS (docs/ACCOUNTING-DECISIONS.md). */
@Module({
  imports: [MailModule],
  controllers: [AccountingController, EntriesController, IntegrationController, AccountingReportsController, AccountantsController, ArchiveController],
  providers: [AccountingService, ChartService, PeriodsService, EntriesService, IntegrationService, MappingService, TemplatesService, AccountingReportsService, YearEndService, AccountingSaftService, AccountantsService, ArchiveService],
  exports: [AccountingService, ChartService, PeriodsService, EntriesService, IntegrationService],
})
export class AccountingModule {}
