import { Module } from "@nestjs/common";
import { AgtController } from "./agt.controller";
import { AgtQueueService } from "./agt-queue.service";

/** AGT e-invoicing (docs/plans/ANGOLA.md, phase 9), off unless AGT_EINVOICE_ENABLED. */
@Module({
  controllers: [AgtController],
  providers: [AgtQueueService],
  exports: [AgtQueueService],
})
export class AgtModule {}
