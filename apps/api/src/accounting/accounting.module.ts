import { Module } from "@nestjs/common";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { ChartService } from "./chart.service";
import { PeriodsService } from "./periods.service";

/** Contabilidade: the books, posted from the POS (docs/ACCOUNTING-DECISIONS.md). */
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, ChartService, PeriodsService],
  exports: [AccountingService, ChartService, PeriodsService],
})
export class AccountingModule {}
