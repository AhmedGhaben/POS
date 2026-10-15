import { Global, Module } from "@nestjs/common";
import { FiscalController } from "./fiscal.controller";
import { FiscalService } from "./fiscal.service";
import { SIGNATURE_PROVIDER, signerFromEnv } from "./signature";

/** Global: sales, returns and cancels issue and annul documents in their own transactions. */
@Global()
@Module({
  controllers: [FiscalController],
  providers: [FiscalService, { provide: SIGNATURE_PROVIDER, useFactory: () => signerFromEnv() }],
  exports: [FiscalService],
})
export class FiscalModule {}
