import { Module } from "@nestjs/common";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { ChartService } from "./chart.service";
import { PeriodsService } from "./periods.service";
import { EntriesController } from "./entries.controller";
import { EntriesService } from "./entries.service";

/** Contabilidade: the books, posted from the POS (docs/ACCOUNTING-DECISIONS.md). */
@Module({
  controllers: [AccountingController, EntriesController],
  providers: [AccountingService, ChartService, PeriodsService, EntriesService],
  exports: [AccountingService, ChartService, PeriodsService, EntriesService],
})
export class AccountingModule {}
