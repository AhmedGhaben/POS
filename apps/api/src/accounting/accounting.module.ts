import { Module } from "@nestjs/common";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { ChartService } from "./chart.service";

/** Contabilidade: the books, posted from the POS (docs/ACCOUNTING-DECISIONS.md). */
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, ChartService],
  exports: [AccountingService, ChartService],
})
export class AccountingModule {}
