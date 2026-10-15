import { Global, Module } from "@nestjs/common";
import { AccountsController } from "./accounts.controller";
import { CustomerAccountsService } from "./customer-accounts.service";
import { SupplierAccountsService } from "./supplier-accounts.service";

/** Global: sales check credit and take deposits, purchases record what's paid, lists show balances. */
@Global()
@Module({
  controllers: [AccountsController],
  providers: [CustomerAccountsService, SupplierAccountsService],
  exports: [CustomerAccountsService, SupplierAccountsService],
})
export class AccountsModule {}
