import { Module } from "@nestjs/common";
import { BankAccountsController, TaxRatesController } from "./company.controller";
import { CompanyService } from "./company.service";

@Module({
  controllers: [BankAccountsController, TaxRatesController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
